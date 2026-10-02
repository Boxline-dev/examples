/**
 * LangChain with Boxline: two LangChain tools backed by Boxline, given to a LangChain agent (createAgent) on your own
 * OpenAI key: `boxline_fetch` reads a page in a sandboxed browser, and `boxline_browser_agent` hands a whole browser
 * task (clicking, typing, several pages) to a Boxline agent run.
 *
 *   npm install && npx tsx index.ts        (BOXLINE_API_KEY and OPENAI_API_KEY in the environment; LC_MODEL, QUESTION)
 *
 * Writes output/result.json: the answer and every tool call.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Boxline } from "@boxline/sdk";
import { ChatOpenAI } from "@langchain/openai";
import { createAgent, tool } from "langchain";
import { z } from "zod";

const out = process.env.OUTPUT_DIR ?? "output";
const question = process.env.QUESTION ?? 'On books.toscrape.com, what does "Sapiens: A Brief History of Humankind" cost, and how many are in stock?';
const bx = new Boxline();
const boxlineRuns: { id: string }[] = [];

const boxlineFetch = tool(
  async ({ url }) => {
    const page = await bx.fetch(url, { format: "markdown", links: true });
    return JSON.stringify({ url: page.finalUrl, status: page.status, title: page.title, content: page.content.slice(0, 12_000), links: (page.links ?? []).slice(0, 80) });
  },
  {
    name: "boxline_fetch",
    description: "Open a web page in a real browser (in a Boxline sandbox) and return it as Markdown with its links.",
    schema: z.object({ url: z.string().describe("an http(s) address") }),
  },
);

const boxlineBrowserAgent = tool(
  async ({ task }) => {
    const run = await bx.agent.run({ task, maxSteps: 20 });
    boxlineRuns.push({ id: run.id });
    const done = await bx.agent.wait(run.id, { timeoutMs: 8 * 60_000 });
    return done.status === "completed" ? (done.result ?? "") : `The browser agent ${done.status}: ${done.error ?? ""}`;
  },
  {
    name: "boxline_browser_agent",
    description: "Give a browser task that needs clicking, typing or several pages to an AI agent with its own browser. Returns its answer.",
    schema: z.object({ task: z.string().describe("what to do, with the site's address") }),
  },
);

const agent = createAgent({
  // The Responses API: newer OpenAI models take function tools only there.
  model: new ChatOpenAI({ model: process.env.LC_MODEL ?? "gpt-6-luna", useResponsesApi: true }),
  tools: [boxlineFetch, boxlineBrowserAgent],
  systemPrompt: "Answer from pages you read with the tools. Prefer boxline_fetch; use boxline_browser_agent only when a task needs clicking or typing.",
});
const result = await agent.invoke({ messages: [{ role: "user", content: question }] });

const calls = result.messages.flatMap((m: any) => (m.tool_calls ?? []).map((c: any) => ({ tool: c.name, input: c.args })));
const answer = result.messages.at(-1)?.text ?? ""; // .text joins the message's text blocks
for (const c of calls) console.log(`→ ${c.tool} ${JSON.stringify(c.input)}`);
console.log(`\n${answer}`);
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "result.json"), JSON.stringify({ question, answer, calls, agentRuns: boxlineRuns }, null, 2));
