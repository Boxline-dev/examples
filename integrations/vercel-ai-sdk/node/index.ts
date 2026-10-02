/**
 * Vercel AI SDK with Boxline: Boxline's web search and page fetch as AI SDK tools. The model (your own OpenAI key)
 * decides when to search and which pages to read; each page renders in a real browser inside a Boxline sandbox.
 *
 *   npm install && npx tsx index.ts        (BOXLINE_API_KEY and OPENAI_API_KEY in the environment; AI_MODEL, QUESTION)
 *
 * Writes output/result.json: the answer and every tool call.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { openai } from "@ai-sdk/openai";
import { Boxline } from "@boxline/sdk";
import { generateText, isStepCount, tool } from "ai";
import { z } from "zod";

const out = process.env.OUTPUT_DIR ?? "output";
const question = process.env.QUESTION ?? 'On books.toscrape.com, what does "Sapiens: A Brief History of Humankind" cost, and how many are in stock?';
const bx = new Boxline();

const tools = {
  boxline_search: tool({
    description: "Search the web. Returns titles, addresses and snippets.",
    inputSchema: z.object({ query: z.string(), limit: z.number().int().min(1).max(10).optional() }),
    execute: async ({ query, limit }) => (await bx.search({ query, limit: limit ?? 5 })).results.map(({ title, url, snippet }) => ({ title, url, snippet })),
  }),
  boxline_fetch: tool({
    description: "Open a web page in a real browser and return it as Markdown, with the absolute addresses of its links.",
    inputSchema: z.object({ url: z.string().url() }),
    execute: async ({ url }) => {
      const page = await bx.fetch(url, { format: "markdown", links: true });
      return { url: page.finalUrl, status: page.status, title: page.title, content: page.content.slice(0, 12_000), links: (page.links ?? []).slice(0, 80) };
    },
  }),
};

const result = await generateText({
  model: openai(process.env.AI_MODEL ?? "gpt-6-luna"),
  tools,
  stopWhen: isStepCount(8),
  system: "Answer from the pages you read with the tools, and say which page the answer came from.",
  prompt: question,
});

const calls = result.steps.flatMap((s) => s.toolCalls.map((c) => ({ tool: c.toolName, input: c.input })));
for (const c of calls) console.log(`→ ${c.tool} ${JSON.stringify(c.input)}`);
console.log(`\n${result.text}`);
mkdirSync(out, { recursive: true });
writeFileSync(
  join(out, "result.json"),
  JSON.stringify({ question, answer: result.text, calls, steps: result.steps.length, usage: { ownModelTokens: result.totalUsage.totalTokens ?? 0 } }, null, 2),
);
