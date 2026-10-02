/**
 * Research a question: an agent searches the web, reads several sources in its browser, and answers with citations.
 *
 *   npx tsx node/index.ts            (BOXLINE_API_KEY; QUESTION for your own question; a plan with web search)
 *
 * Writes output/result.json: the answer, its sources, the searches it ran and the pages it opened.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Boxline } from "@boxline/sdk";

const out = process.env.OUTPUT_DIR ?? "output";
const question = process.env.QUESTION ?? "When was the James Webb Space Telescope launched, and where does it orbit?";
const bx = new Boxline();

const run = await bx.agent.run({
  task:
    `Research this question on the web: "${question}" Use web search, open and read at least two good sources, and answer ` +
    'in two or three sentences. End with a line "Sources:" followed by the addresses of the pages you read, one per line.',
  maxSteps: 25,
});
console.log(`Agent run ${run.id} (${run.provider}/${run.model}) · Session: ${run.sessionId}`);
for await (const e of bx.agent.stream(run.id)) {
  if (e.type === "tool" && e.name === "web_search") console.log(`search: ${(e.input as { query?: string })?.query}`);
  else if (e.type === "tool" && e.name === "browser_navigate") console.log(`read:   ${(e.input as { url?: string })?.url}`);
  else if (e.type === "done") console.log(`\n${e.status}:\n${e.result ?? e.error}`);
}

const done = await bx.agent.get(run.id);
const tools = done.steps.filter((s) => s.type === "tool");
const searches = tools.filter((s) => s.name === "web_search").map((s) => (s.input as { query?: string })?.query ?? "");
const opened = tools.filter((s) => s.name === "browser_navigate").map((s) => (s.input as { url?: string })?.url ?? "");
const answer = done.result ?? "";
const sources = [...new Set((answer.split(/\bSources:/i)[1] ?? "").match(/https?:\/\/[^\s)>\]]+/g) ?? [])];

mkdirSync(out, { recursive: true });
writeFileSync(
  join(out, "result.json"),
  JSON.stringify({ question, status: done.status, answer, sources, searches, opened, agentRuns: [{ id: run.id }], model: done.model, costUsd: done.usage.costUsd, usage: { searches: searches.length } }, null, 2),
);
