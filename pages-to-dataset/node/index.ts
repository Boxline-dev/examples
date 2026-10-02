/**
 * Pages to dataset: turn web pages into a dataset for fine-tuning or evaluation: clean text passages (boilerplate and
 * near-duplicates removed) and question-answer pairs whose evidence is checked against the page, split into train
 * and eval sets in JSONL. The pages come from a list of addresses, or from a web search.
 *
 *   npx tsx node/index.ts            (BOXLINE_API_KEY; URLS comma-separated, or QUERY; CHUNK_TOKENS, QA_PER_PAGE, EVAL_SHARE)
 *
 * Use pages you may reuse this way (your own docs, openly licensed content). Writes output/train.jsonl,
 * output/eval.jsonl and output/result.json.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Boxline } from "@boxline/sdk";

const out = process.env.OUTPUT_DIR ?? "output";
const urls = (process.env.URLS ?? "").split(",").map((u) => u.trim()).filter(Boolean);
const query = process.env.QUERY ?? (urls.length ? "" : "how do vector databases index embeddings");
const chunkTokens = Number(process.env.CHUNK_TOKENS ?? 200);
const qaPerPage = Number(process.env.QA_PER_PAGE ?? 3);
const evalShare = Number(process.env.EVAL_SHARE ?? 0.2);
const bx = new Boxline();

type Page = { url: string; title: string; text: string };
const tokens = (s: string) => Math.ceil(s.length / 4);
const norm = (s: string) => s.toLowerCase().replace(/[*_`#>\[\]()]/g, " ").replace(/\s+/g, " ").trim();
const LINK = /!?\[([^\]]*)\]\([^)]*\)/g;
const isLinkList = (block: string) => {
  const links = [...block.matchAll(LINK)];
  if (links.length < 3) return false;
  const visible = block.replace(LINK, "$1").replace(/[*_#>`|-]/g, "").replace(/\s+/g, "").length;
  return visible === 0 || links.reduce((n, m) => n + m[1]!.replace(/\s+/g, "").length, 0) / visible >= 0.7;
};

// 1. Collect: the search's top pages come back as Markdown with the results; listed addresses are fetched, 3 at a time.
let pages: Page[] = [];
let searches = 0;
if (query) {
  const found = await bx.search({ query, limit: 5, fetch: 5 });
  searches = found.cached ? 0 : 1;
  pages = found.results.filter((r) => r.content).map((r) => ({ url: r.page?.finalUrl ?? r.url, title: r.title, text: r.content! }));
  console.log(`Search "${query}": ${found.results.length} results, ${pages.length} pages read`);
} else {
  for (let i = 0; i < urls.length; i += 3) {
    const got = await Promise.allSettled(urls.slice(i, i + 3).map((u) => bx.fetch(u, { format: "markdown" })));
    for (const g of got) if (g.status === "fulfilled" && (g.value.status ?? 0) < 400) pages.push({ url: g.value.finalUrl, title: g.value.title, text: g.value.content });
    for (const g of got) if (g.status === "rejected") console.log(`  skipped: ${(g.reason as Error).message}`);
  }
  console.log(`${pages.length} of ${urls.length} pages read`);
}
if (!pages.length) throw new Error("no page could be read");

// 2. Clean: lines most pages repeat, navigation-like link lists, and what comes before each page's title go. A
//    paragraph sharing 80% or more of its 5-word shingles with one kept before is a near-duplicate and goes too.
const seen = new Map<string, number>();
for (const p of pages) for (const l of new Set(p.text.split("\n").map((x) => x.trim()).filter((x) => x.length > 3 && !x.startsWith("#")))) seen.set(l, (seen.get(l) ?? 0) + 1);
const boilerplate = new Set(pages.length >= 3 ? [...seen].filter(([, n]) => n >= Math.max(2, Math.ceil(pages.length * 0.6))).map(([l]) => l) : []);
const shingles = (s: string) => {
  const w = norm(s).split(" ");
  return new Set(w.length < 5 ? [w.join(" ")] : w.slice(0, -4).map((_, i) => w.slice(i, i + 5).join(" ")));
};
const keptShingles: Set<string>[] = [];
const nearDuplicate = (text: string) => {
  const sh = shingles(text);
  const dup = keptShingles.some((k) => {
    const inter = [...sh].filter((x) => k.has(x)).length;
    return inter / (sh.size + k.size - inter) >= 0.8;
  });
  if (!dup) keptShingles.push(sh);
  return dup;
};
let duplicates = 0;
const kept: { url: string; title: string; text: string }[] = [];
for (const p of pages) {
  const blocks = p.text.split(/\n\s*\n/);
  const titleAt = blocks.findIndex((b) => /^#\s/.test(b.trim()));
  let buf: string[] = [];
  const emit = () => {
    if (buf.length) kept.push({ url: p.url, title: p.title, text: buf.join("\n\n") });
    buf = [];
  };
  for (const block of titleAt > 0 ? blocks.slice(titleAt) : blocks) {
    const text = block.split("\n").filter((l) => !boilerplate.has(l.trim())).join("\n").trim();
    if (!text || isLinkList(text) || /^#{1,6}\s/.test(text) || text.length < 40) continue; // headings and scraps alone are no passage
    if (nearDuplicate(text)) {
      duplicates++;
      continue;
    }
    // 3. Passages: paragraphs of a page together, within the token budget.
    if (tokens([...buf, text].join("\n\n")) > chunkTokens) emit();
    buf.push(text.length / 4 > chunkTokens ? text.slice(0, chunkTokens * 4) : text);
  }
  emit();
}
console.log(`${kept.length} passages, ${duplicates} near-duplicate paragraphs dropped, ${boilerplate.size} boilerplate lines removed`);

// 4. Question-answer pairs, 10 pages per extract call; a pair whose evidence is not on its page is dropped.
type Pair = { url: string; question: string; answer: string; evidence: string };
const pairs: Pair[] = [];
let unverified = 0;
let modelUsd = 0;
for (let i = 0; i < pages.length && qaPerPage > 0; i += 10) {
  const batch = pages.slice(i, i + 10);
  const r = await bx.extract<{ pairs: Pair[] }>({
    urls: batch.map((p) => p.url),
    prompt: `For each page, ${qaPerPage} question-answer pairs a reader could answer from that page alone, about its most specific facts. evidence: one sentence copied exactly from the page that supports the answer. url: the page's address as given.`,
    schema: { type: "object", properties: { pairs: { type: "array", items: { type: "object", properties: { url: { type: "string" }, question: { type: "string" }, answer: { type: "string" }, evidence: { type: "string" } }, required: ["url", "question", "answer", "evidence"] } } }, required: ["pairs"] },
  });
  modelUsd += r.usage.costUsd;
  for (const q of r.data.pairs) {
    const page = batch.find((p) => p.url === q.url) ?? batch.find((p) => norm(p.text).includes(norm(q.evidence)));
    if (page && norm(page.text).includes(norm(q.evidence))) pairs.push({ ...q, url: page.url });
    else unverified++;
  }
}
console.log(`${pairs.length} question-answer pairs kept, ${unverified} dropped (their evidence is not on the page)`);

// 5. Records, split by a hash of their id (the same record always lands in the same set).
const id = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 12);
const records = [
  ...kept.map((p) => ({ id: id(`text:${p.url}:${p.text}`), type: "text" as const, url: p.url, title: p.title, text: p.text, tokens: tokens(p.text) })),
  ...pairs.map((q) => ({ id: id(`qa:${q.url}:${q.question}`), type: "qa" as const, url: q.url, question: q.question, answer: q.answer, evidence: q.evidence })),
];
const inEval = (r: { id: string }) => parseInt(r.id.slice(0, 8), 16) / 0xffffffff < evalShare;
let train = records.filter((r) => !inEval(r));
let evalSet = records.filter(inEval);
if (!evalSet.length && records.length > 1 && evalShare > 0) [evalSet, train] = [train.slice(0, 1), train.slice(1)]; // at least one to evaluate on
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "train.jsonl"), train.map((r) => JSON.stringify(r)).join("\n") + "\n");
writeFileSync(join(out, "eval.jsonl"), evalSet.map((r) => JSON.stringify(r)).join("\n") + "\n");
writeFileSync(join(out, "result.json"), JSON.stringify({ query: query || null, urls, pages: pages.map((p) => p.url), passages: kept.length, duplicates, boilerplate: boilerplate.size, pairs: pairs.length, unverified, train: train.length, eval: evalSet.length, usage: { modelUsd, searches } }, null, 2));
console.log(`train.jsonl: ${train.length} records, eval.jsonl: ${evalSet.length}`);
for (const q of pairs.slice(0, 3)) console.log(`  Q: ${q.question}\n  A: ${q.answer}`);
