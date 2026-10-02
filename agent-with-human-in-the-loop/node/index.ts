/**
 * Agent with a human in the loop: an agent that asks you when it is unsure (here: which of several books to pick),
 * waits for your answer, then carries on.
 *
 *   npx tsx node/index.ts            (BOXLINE_API_KEY; TASK for your own task)
 *
 * Writes output/result.json.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { Boxline } from "@boxline/sdk";

const out = process.env.OUTPUT_DIR ?? "output";
const task =
  process.env.TASK ??
  "On https://books.toscrape.com, open the Travel category and find the books that cost less than £30. If more than one " +
    "fits, don't finish yet: ask me for help to choose, and wait until I hand the browser back with my choice. Then tell " +
    "me the title and price of the one I chose.";
const bx = new Boxline();

const run = await bx.agent.run({ task, maxSteps: 25 });
console.log(`Agent run ${run.id} (${run.provider}/${run.model}) · Session: ${run.sessionId}`);

const rl = createInterface({ input: process.stdin, output: process.stdout });
const questions: string[] = [];
for await (const e of bx.agent.stream(run.id)) {
  if (e.type === "thought") console.log(`  ${e.text}`);
  else if (e.type === "tool") console.log(`→ ${e.name} ${JSON.stringify(e.input ?? {}).slice(0, 100)}`);
  else if (e.type === "handover" && e.by === "agent") {
    // The run is paused: the browser is yours (watch or act in the live view), and your note goes back to the agent.
    questions.push(e.text ?? "");
    console.log(`\nThe agent asks: ${e.text}`);
    const answer = await rl.question("Your answer: ");
    await bx.agent.handBack(run.id, answer);
  } else if (e.type === "done") console.log(`\n${e.status}: ${e.result ?? e.error}`);
}
rl.close();

const done = await bx.agent.get(run.id);
mkdirSync(out, { recursive: true });
writeFileSync(
  join(out, "result.json"),
  JSON.stringify({ task, agentRuns: [{ id: run.id }], status: done.status, answer: done.result, questions, steps: done.steps.length, model: done.model, costUsd: done.usage.costUsd }, null, 2),
);
