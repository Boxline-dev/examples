/**
 * Computer use: the agent drives the browser the way a person does, from screenshots with the mouse and keyboard
 * (the model provider's own computer-use tool), instead of reading the page's structure.
 *
 *   npx tsx node/index.ts            (BOXLINE_API_KEY; TASK for your own task)
 *
 * Writes output/result.json with the answer and the actions the model took.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Boxline } from "@boxline/sdk";

const out = process.env.OUTPUT_DIR ?? "output";
const task = process.env.TASK ?? "On https://books.toscrape.com, open the Poetry category and tell me the title and price of the cheapest book in it.";
const bx = new Boxline();

// A model with a computer-use tool: the configured default when it has one, else the first that does.
const catalog = await bx.agent.models();
const choices = catalog.providers.filter((p) => p.available).flatMap((p) => p.models.filter((m) => m.supportsComputerUse).map((m) => ({ provider: p.id, model: m.id })));
const pick = choices.find((c) => c.provider === catalog.default.provider && c.model === catalog.default.model) ?? choices[0];
if (!pick) throw new Error("no configured model has a computer-use tool (see bx.agent.models())");

const run = await bx.agent.run({ task, mode: "computer", provider: pick.provider, model: pick.model, maxSteps: 40 });
console.log(`Agent run ${run.id} (${run.provider}/${run.model}, computer mode) · Session: ${run.sessionId}`);
for await (const e of bx.agent.stream(run.id)) {
  if (e.type === "thought") console.log(`  ${e.text}`);
  else if (e.type === "tool") console.log(`→ ${e.name} ${JSON.stringify(e.input ?? {}).slice(0, 110)}`);
  else if (e.type === "done") console.log(`\n${e.status}: ${e.result ?? e.error}`);
}

const done = await bx.agent.get(run.id);
const actions = done.steps.filter((s) => s.type === "tool" && s.name === "computer").map((s) => s.input);
mkdirSync(out, { recursive: true });
writeFileSync(
  join(out, "result.json"),
  JSON.stringify({ task, mode: done.mode, model: done.model, status: done.status, answer: done.result, computerActions: actions.length, actions, agentRuns: [{ id: run.id }], costUsd: done.usage.costUsd }, null, 2),
);
