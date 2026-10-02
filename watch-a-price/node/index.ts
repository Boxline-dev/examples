/**
 * Watch a price: a task reads a product's price and stock into a fixed shape (an output schema), a schedule runs it
 * every hour, and each finished run goes to your webhook receiver (task_run.finished), which compares the price with
 * the last one it saw.
 *
 *   npx tsx node/index.ts      (BOXLINE_API_KEY; PRODUCT_URL, SCHEDULE, RUNS; KEEP_SCHEDULE=1 to leave it running)
 *
 * The example starts the receiver (receiver.ts) in this process and runs the task right away RUNS times instead of
 * waiting for the schedule. Because this receiver stops with the example, it switches the schedule off at the end
 * unless KEEP_SCHEDULE=1 (run receiver.ts on a public HTTPS address for that). Writes output/result.json.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Boxline, type TaskCreateParams } from "@boxline/sdk";
import { startReceiver, type Price } from "./receiver.js";

const out = process.env.OUTPUT_DIR ?? "output";
const productUrl = process.env.PRODUCT_URL ?? "https://books.toscrape.com/catalogue/sapiens-a-brief-history-of-humankind_996/index.html";
const cron = process.env.SCHEDULE ?? "0 * * * *"; // every hour, on the hour (at most every 5 minutes)
const runs = Number(process.env.RUNS ?? 1);
const keep = process.env.KEEP_SCHEDULE === "1";
const bx = new Boxline();
mkdirSync(out, { recursive: true });

// 1. The receiver, and a webhook endpoint for it. Its secret is shown only now: the receiver keeps it in memory.
const receiver = await startReceiver({ stateFile: join(out, "last-price.json") });
const endpoint = await bx.webhooks.create({ url: receiver.url, events: ["task_run.finished"], description: "Watch a price (example)" });
receiver.setSecret(endpoint.secret);
console.log(`Webhook endpoint ${endpoint.id} → ${receiver.url}`);

// 2. The task and its schedule; running the example again updates the task of the same name.
const name = `Watch a price: ${new URL(productUrl).pathname.split("/").filter(Boolean).slice(-2, -1)[0] ?? productUrl}`.slice(0, 100);
const spec: TaskCreateParams = {
  name,
  instruction: "Open %url% and read the product on it: its title, its price as a number, the currency, and whether it is in stock.",
  variables: [{ name: "url", default: productUrl, description: "The product page" }],
  output: {
    type: "object",
    properties: {
      title: { type: "string", minLength: 1 },
      price: { type: "number", exclusiveMinimum: 0 },
      currency: { type: "string", description: "ISO 4217 code, e.g. GBP" },
      inStock: { type: "boolean" },
    },
    required: ["title", "price", "currency", "inStock"],
    additionalProperties: false,
  },
  maxSteps: 10,
  schedule: { cron, timezone: "UTC", enabled: true },
};
const existing = (await bx.tasks.list({ limit: 100 })).data.find((t) => t.name === name);
const task = existing ? await bx.tasks.update(existing.id, spec) : await bx.tasks.create(spec);
const schedule = { cron: task.schedule!.cron, timezone: task.schedule!.timezone, nextRunAt: task.schedule!.nextRunAt, setAt: new Date().toISOString() };
console.log(`Task ${task.id} "${name}": runs "${cron}" (UTC), next at ${schedule.nextRunAt}`);

// 3. Run it now instead of waiting for the schedule; each finished run's webhook reaches the receiver.
const done = [];
try {
  for (let i = 0; i < runs; i++) {
    const started = await bx.tasks.run<Price>(task.id);
    console.log(`Run ${started.id} (agent run ${started.runId}) · Session: ${started.sessionId}`);
    const run = await bx.tasks.waitForRun<Price>(started, { timeoutMs: 5 * 60_000 });
    console.log(`  ${run.status}: ${JSON.stringify(run.result)}`);
    const delivery = await receiver.waitFor(run.id, 90_000);
    done.push({ taskRunId: run.id, runId: run.runId, status: run.status, result: run.result, costUsd: run.usage.costUsd, webhook: delivery.message });
  }
} finally {
  await receiver.close();
  await bx.webhooks.delete(endpoint.id); // this receiver is gone
  if (!keep) await bx.tasks.update(task.id, { schedule: { enabled: false } });
}
const after = await bx.tasks.get(task.id);
console.log(keep ? `The schedule stays on: next run at ${after.schedule?.nextRunAt}` : "The schedule is switched off (this receiver stopped); KEEP_SCHEDULE=1 leaves it on.");

writeFileSync(
  join(out, "result.json"),
  JSON.stringify(
    {
      productUrl,
      task: { id: task.id, name, schedule, enabledAtEnd: after.schedule?.enabled ?? false },
      runs: done,
      deliveries: receiver.deliveries,
      agentRuns: done.flatMap((r) => (r.runId ? [{ id: r.runId }] : [])),
      made: { tasks: [task.id], webhooks: [endpoint.id] },
    },
    null,
    2,
  ),
);
