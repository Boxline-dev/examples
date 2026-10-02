/**
 * Chat with a page: open a page once in a session, then ask questions about it. Each answer comes from the page
 * that is open in the browser (session.extract), with the chat so far, and quotes the sentence it is based on.
 *
 *   npx tsx node/index.ts            (BOXLINE_API_KEY; PAGE_URL for another page)
 *
 * QUESTIONS="first?|second?" answers those and stops; without it, type questions and "exit" to stop.
 * Writes output/result.json and output/page.md (the page as the model read it).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { Boxline } from "@boxline/sdk";

const out = process.env.OUTPUT_DIR ?? "output";
const url = process.env.PAGE_URL ?? "https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html";
const preset = process.env.QUESTIONS?.split("|").map((q) => q.trim()).filter(Boolean);
const bx = new Boxline();

type Answer = { answer: string; quote: string; found: boolean };
const SCHEMA = {
  type: "object",
  properties: {
    answer: { type: "string", description: "a short answer, from this page only" },
    quote: { type: "string", description: "the exact words on the page the answer is based on, copied as they are; empty when the page does not say" },
    found: { type: "boolean", description: "false when the page does not answer the question" },
  },
  required: ["answer", "quote", "found"],
};

const session = await bx.sessions.create({ timeout: 900, idleTimeout: 300, userMetadata: { example: "chat-with-a-page" } });
console.log(`Session: ${session.id}`);
const turns: { question: string; answer: string; quote: string; found: boolean }[] = [];
let modelUsd = 0;
try {
  const opened = await session.goto(url, { waitUntil: "load" });
  const page = await session.content("markdown");
  console.log(`Opened ${page.url} ("${page.title}"), ${page.content.length} characters. Ask about it (type "exit" to stop).\n`);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "page.md"), page.content);

  const rl = preset ? null : createInterface({ input: process.stdin, output: process.stdout });
  for (let i = 0; ; i++) {
    const question = preset ? preset[i] : (await rl!.question("You: ")).trim();
    if (!question || question.toLowerCase() === "exit") break;
    if (preset) console.log(`You: ${question}`);
    // The chat so far goes into the instruction, so follow-up questions ("and the one after that?") make sense.
    const history = turns.map((t) => `Q: ${t.question}\nA: ${t.answer}`).join("\n");
    const r = await session.extract<Answer>(
      `${history ? `The conversation so far:\n${history}\n\n` : ""}Answer this question about the page: ${question}`,
      { schema: SCHEMA },
    );
    modelUsd += r.usage.costUsd;
    if (!r.data.found && !r.data.answer.trim()) r.data.answer = "The page does not say.";
    turns.push({ question, ...r.data });
    console.log(`AI: ${r.data.answer}${r.data.quote ? `\n    (the page: "${r.data.quote}")` : ""}\n`);
  }
  rl?.close();

  writeFileSync(join(out, "result.json"), JSON.stringify({ url, finalUrl: page.url, title: page.title, status: opened.status, turns, usage: { modelUsd } }, null, 2));
  console.log(`${turns.length} answers for $${modelUsd.toFixed(4)} of model use.`);
} finally {
  await session.release();
}
