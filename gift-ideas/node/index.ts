/**
 * Gift ideas: describe the person and a budget, and get gift ideas found on real gift guides and reviews, each with
 * why it suits them, a price range, and the page it came from. Ideas over the budget are left out.
 *
 *   npx tsx node/index.ts            (BOXLINE_API_KEY; RECIPIENT, BUDGET, CURRENCY)
 *
 * One search, then one extract over the top pages. Writes output/result.json and output/ideas.md.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Boxline } from "@boxline/sdk";

const out = process.env.OUTPUT_DIR ?? "output";
const recipient = process.env.RECIPIENT ?? "a friend in their thirties who loves rock climbing and good coffee";
const budget = Number(process.env.BUDGET ?? 60);
const currency = process.env.CURRENCY ?? "USD";
const bx = new Boxline();

type Idea = { idea: string; why: string; priceMin: number | null; priceMax: number | null; currency: string | null; source: string };

// 1. Gift guides and reviews for this person (the platform's search; no shop is scraped).
const found = await bx.search({ query: `gift ideas for ${recipient} under ${budget} ${currency}`, limit: 8 });
const urls = found.results.map((r) => r.url).slice(0, 5);
console.log(`Reading ${urls.length} pages:\n${urls.map((u) => `  ${u}`).join("\n")}`);
if (!urls.length) throw new Error("the search found nothing; describe the person differently");

// 2. Ideas from those pages, each tied to the person and to its page.
const r = await bx.extract<{ ideas: Idea[] }>({
  urls,
  prompt:
    `Gift ideas for ${recipient}, with a budget of ${budget} ${currency}. From these pages only: 6 to 10 ideas, the most fitting first. ` +
    `why: one sentence on why it suits this person. priceMin / priceMax: the price range the page gives (null when it gives none). source: the URL of the page it is from.`,
  schema: {
    type: "object",
    properties: {
      ideas: {
        type: "array",
        items: { type: "object", properties: { idea: { type: "string" }, why: { type: "string" }, priceMin: { type: ["number", "null"] }, priceMax: { type: ["number", "null"] }, currency: { type: ["string", "null"] }, source: { type: "string" } }, required: ["idea", "why", "priceMin", "priceMax", "currency", "source"] },
      },
    },
    required: ["ideas"],
  },
});
const read = new Set(r.pages.filter((p) => !p.error && (p.status ?? 0) < 400).flatMap((p) => [p.url, p.finalUrl]));
const strip = (u: string) => u.replace(/[#?].*$/, "").replace(/\/$/, "");
const known = new Set([...read].filter(Boolean).map((u) => strip(u!)));
// Kept: ideas from a page that was read, within the budget when a price is given (in the same currency).
const ideas = r.data.ideas.filter((i) => known.has(strip(i.source)) && !(i.priceMin !== null && (i.currency ?? currency) === currency && i.priceMin > budget));
console.log(`\n${ideas.length} ideas within ${budget} ${currency} (of ${r.data.ideas.length} found):`);
for (const i of ideas) console.log(`  • ${i.idea}${i.priceMin !== null ? ` (${i.priceMin}${i.priceMax && i.priceMax !== i.priceMin ? `–${i.priceMax}` : ""} ${i.currency ?? currency})` : ""}\n    ${i.why}\n    ${i.source}`);

const md = [`# Gift ideas for ${recipient}`, "", `Budget: ${budget} ${currency}.`, "", ...ideas.map((i) => `- **${i.idea}**${i.priceMin !== null ? ` (${i.priceMin}${i.priceMax && i.priceMax !== i.priceMin ? `–${i.priceMax}` : ""} ${i.currency ?? currency})` : ""}: ${i.why} ([source](${i.source}))`), ""].join("\n");
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "ideas.md"), md);
writeFileSync(join(out, "result.json"), JSON.stringify({ recipient, budget, currency, pages: r.pages, ideas, dropped: r.data.ideas.length - ideas.length, usage: { modelUsd: r.usage.costUsd, searches: found.cached ? 0 : 1 } }, null, 2));
