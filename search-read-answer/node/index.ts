/**
 * Search, read, answer: search the web, read the top results in a sandboxed browser, and answer with sources.
 *
 *   npx tsx node/index.ts            (BOXLINE_API_KEY; QUESTION for your own question)
 *
 * Writes output/result.json: the search results, the answer and the pages it came from.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Boxline } from "@boxline/sdk";

const out = process.env.OUTPUT_DIR ?? "output";
const question = process.env.QUESTION ?? "In what year was the Python programming language first released?";
const bx = new Boxline();

// 1. Search, and open the top 3 results as Markdown (in a real browser inside a sandbox, never on this computer).
//    The query goes to the search provider: keep passwords and personal data out of it.
const found = await bx.search({ query: question, limit: 5, fetch: 3 });
console.log(`${found.results.length} results${found.cached ? " (from the cache)" : ""}:`);
for (const r of found.results) console.log(`  ${r.content ? "read" : "    "}  ${r.title} (${r.url})${r.error ? ` (${r.error.code})` : ""}`);

// 2. Answer from the pages that loaded, with a schema so the answer and its sources come back as data.
const read = found.results.filter((r) => r.content).map((r) => r.url);
if (!read.length) throw new Error("none of the top results could be opened; try another question");
const answer = await bx.extract<{ answer: string; sources: string[] }>({
  urls: read,
  prompt: `Answer this question in one or two sentences, using only these pages: "${question}". In "sources", list the URLs of the pages the answer comes from.`,
  schema: {
    type: "object",
    properties: { answer: { type: "string" }, sources: { type: "array", items: { type: "string" } } },
    required: ["answer", "sources"],
  },
});
console.log(`\n${answer.data.answer}\nSources:\n${answer.data.sources.map((s) => `  - ${s}`).join("\n")}`);

mkdirSync(out, { recursive: true });
writeFileSync(
  join(out, "result.json"),
  JSON.stringify(
    {
      question,
      results: found.results.map((r) => ({ title: r.title, url: r.url, read: Boolean(r.content) })),
      answer: answer.data.answer,
      sources: answer.data.sources,
      model: answer.model,
      usage: { modelUsd: answer.usage.costUsd, searches: found.cached ? 0 : 1 },
    },
    null,
    2,
  ),
);
