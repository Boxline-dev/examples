/**
 * Company research: research a company on one topic. Search the web, read the top pages in a sandboxed browser, and
 * return structured findings where every key point names the page it comes from.
 *
 *   npx tsx node/index.ts            (BOXLINE_API_KEY; COMPANY and TOPIC for your own research)
 *
 * Writes output/result.json and output/report.md.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Boxline } from "@boxline/sdk";

const out = process.env.OUTPUT_DIR ?? "output";
const company = process.env.COMPANY ?? "Mozilla";
const topic = process.env.TOPIC ?? "how it makes money";
const bx = new Boxline();

type Findings = {
  companyName: string;
  overview: string;
  findings: string;
  keyPoints: { point: string; source: string }[];
  openQuestions: string[];
};

// 1. Search (the platform's search provider; no search engine pages are scraped). The query leaves your computer:
//    keep personal data out of it.
const found = await bx.search({ query: `${company} ${topic}`, limit: 8 });
const urls = found.results.map((r) => r.url).slice(0, 5);
console.log(`Researching ${company}: ${topic}. Reading ${urls.length} of ${found.results.length} results:`);
for (const u of urls) console.log(`  ${u}`);
if (!urls.length) throw new Error("the search found nothing; try another company or topic");

// 2. Read those pages in a real browser and fill a schema. Page text is data for the model, never instructions.
const r = await bx.extract<Findings>({
  urls,
  prompt:
    `Research ${company}, specifically: ${topic}. Use only these pages. overview: what the company is, in two sentences. ` +
    `findings: what the pages say about the topic, in one paragraph. keyPoints: 3 to 6 facts about the topic, each with ` +
    `the URL of the page it comes from (one of the pages given). openQuestions: what the pages leave unanswered.`,
  schema: {
    type: "object",
    properties: {
      companyName: { type: "string" },
      overview: { type: "string" },
      findings: { type: "string" },
      keyPoints: {
        type: "array",
        items: { type: "object", properties: { point: { type: "string" }, source: { type: "string", description: "the URL of the page" } }, required: ["point", "source"] },
      },
      openQuestions: { type: "array", items: { type: "string" } },
    },
    required: ["companyName", "overview", "findings", "keyPoints", "openQuestions"],
  },
});
const f = r.data;
const read = r.pages.filter((p) => p.status !== null && p.status < 400);
console.log(`\n${f.companyName}\n\n${f.overview}\n\n${f.findings}\n`);
f.keyPoints.forEach((k, i) => console.log(`${i + 1}. ${k.point}\n   (${k.source})`));
if (f.openQuestions.length) console.log(`\nStill open: ${f.openQuestions.join("; ")}`);
console.log(`\nRead ${read.length}/${r.pages.length} pages with ${r.model} for $${r.usage.costUsd.toFixed(4)}.`);

const report = [
  `# ${f.companyName}: ${topic}`,
  "",
  f.overview,
  "",
  f.findings,
  "",
  "## Key points",
  "",
  ...f.keyPoints.map((k) => `- ${k.point} ([source](${k.source}))`),
  "",
  ...(f.openQuestions.length ? ["## Still open", "", ...f.openQuestions.map((q) => `- ${q}`), ""] : []),
].join("\n");
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "report.md"), report);
writeFileSync(
  join(out, "result.json"),
  JSON.stringify({ company, topic, searched: found.results.map((x) => ({ title: x.title, url: x.url })), pages: r.pages, ...f, model: r.model, usage: { modelUsd: r.usage.costUsd, searches: found.cached ? 0 : 1 } }, null, 2),
);
