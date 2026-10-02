/**
 * Context pack: squeeze a few pages into a small, cited context for a model's prompt. Each source gets a tag ([S1],
 * [S2], …), a summary, its key facts (each carrying its tag, each backed by a quote checked against the page) and its
 * main links, and the pack is cut to a token budget, least important facts first.
 *
 *   npx tsx node/index.ts            (BOXLINE_API_KEY; URLS comma-separated, QUESTION to focus on, BUDGET in tokens)
 *
 * Writes output/pack.md (paste it into a prompt), output/pack.json and output/result.json.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Boxline } from "@boxline/sdk";

const out = process.env.OUTPUT_DIR ?? "output";
const urls = (process.env.URLS ?? "https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Caching,https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control")
  .split(",")
  .map((u) => u.trim())
  .filter(Boolean)
  .slice(0, 10);
const question = process.env.QUESTION ?? "";
const budget = Number(process.env.BUDGET ?? 1500);
const bx = new Boxline();

const tokens = (s: string) => Math.ceil(s.length / 4);
const norm = (s: string) => s.toLowerCase().replace(/[*_`#>\[\]()"“”'’]/g, " ").replace(/\s+/g, " ").trim();
type Fact = { fact: string; quote: string; importance: 1 | 2 | 3 };

// 1. The pages' own text (to check quotes against) and their links.
const pages = await Promise.all(urls.map((u) => bx.fetch(u, { format: "markdown", links: true }).catch((e: Error) => ({ url: u, error: e.message }))));
const read = pages.filter((p): p is Exclude<typeof p, { error: string }> => !("error" in p) && (p.status ?? 0) < 400);
for (const p of pages) if ("error" in p) console.log(`  skipped ${p.url}: ${p.error}`);
if (!read.length) throw new Error("no page could be read");

// 2. Summary and facts per source, in one call.
const r = await bx.extract<{ sources: { url: string; summary: string; facts: Fact[] }[] }>({
  urls: read.map((p) => p.finalUrl),
  prompt:
    `For each page: summary, two sentences; facts: the 5 to 8 facts that matter most${question ? ` for this question: "${question}"` : ""}, each one short ` +
    `sentence, with quote (words copied exactly from the page that state it) and importance (3 essential, 2 useful, 1 detail). url: the page's address as given.`,
  schema: {
    type: "object",
    properties: {
      sources: {
        type: "array",
        items: {
          type: "object",
          properties: {
            url: { type: "string" },
            summary: { type: "string" },
            facts: { type: "array", items: { type: "object", properties: { fact: { type: "string" }, quote: { type: "string" }, importance: { type: "integer", enum: [1, 2, 3] } }, required: ["fact", "quote", "importance"] } },
          },
          required: ["url", "summary", "facts"],
        },
      },
    },
    required: ["sources"],
  },
});

// 3. Tag the sources, keep only facts whose quote is on their page, and pick each page's main links.
let unverified = 0;
const sources = read.map((p, i) => {
  const got = r.data.sources.find((s) => s.url === p.finalUrl || s.url === p.url) ?? r.data.sources[i];
  const text = norm(p.content);
  const facts = (got?.facts ?? []).filter((f) => {
    const ok = f.quote.trim().length > 0 && text.includes(norm(f.quote));
    if (!ok) unverified++;
    return ok;
  });
  const host = new URL(p.finalUrl).host;
  const links = (p.links ?? []).filter((l) => new URL(l).host === host && !l.includes("#") && l !== p.finalUrl).slice(0, 5);
  return { id: `S${i + 1}`, url: p.finalUrl, title: p.title, summary: got?.summary ?? "", facts: facts.sort((a, b) => b.importance - a.importance), links };
});

// 4. The pack, cut to the budget: details first, then useful facts, then links, from the last source back.
const render = () =>
  [
    `# Context (${sources.length} sources${question ? `; question: ${question}` : ""})`,
    "",
    "Cite facts with their tags. Sources:",
    ...sources.map((s) => `[${s.id}] ${s.title} (${s.url})`),
    "",
    ...sources.flatMap((s) => [`## [${s.id}] ${s.title}`, "", s.summary, "", ...s.facts.map((f) => `- ${f.fact} [${s.id}]`), ...(s.links.length ? ["", `Links: ${s.links.join(" ")}`] : []), ""]),
  ].join("\n");
let dropped = 0;
for (const level of [1, 2, "links", 3] as const) {
  for (const s of [...sources].reverse()) {
    while (tokens(render()) > budget) {
      if (level === "links") {
        if (!s.links.length) break;
        s.links.pop();
      } else {
        const i = s.facts.map((f) => f.importance).lastIndexOf(level);
        if (i < 0 || s.facts.length <= 1) break; // every source keeps at least its top fact
        s.facts.splice(i, 1);
        dropped++;
      }
    }
  }
}
const pack = render();
console.log(`${sources.length} sources, ${sources.reduce((n, s) => n + s.facts.length, 0)} facts kept (${unverified} without a quote on the page, ${dropped} cut for the budget); ${tokens(pack)} of ${budget} tokens\n`);
console.log(pack);
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "pack.md"), pack);
writeFileSync(join(out, "pack.json"), JSON.stringify({ question: question || null, sources }, null, 2));
writeFileSync(join(out, "result.json"), JSON.stringify({ urls, question: question || null, budget, tokens: tokens(pack), sources: sources.map((s) => ({ id: s.id, url: s.url, facts: s.facts.length })), unverified, dropped, usage: { modelUsd: r.usage.costUsd } }, null, 2));
