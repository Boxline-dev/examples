/**
 * Changelog watcher: a task reads the newest released entry of a product's changelog into JSON (version, date, title,
 * changes, a one-sentence summary) every morning, and the example says whether it is new since the last time it looked.
 * A new entry is posted to your team's chat (a Slack-style incoming webhook) when SLACK_WEBHOOK_URL is set.
 *
 *   CHANGELOG_URL=https://… npx tsx node/index.ts     (BOXLINE_API_KEY; SCHEDULE; KEEP_SCHEDULE=1 to leave it running;
 *                                                      SLACK_WEBHOOK_URL optional)
 *
 * The example runs the task once right away instead of waiting for the schedule, then switches the schedule off unless
 * KEEP_SCHEDULE=1. The last version seen is kept in output/last-seen.json. Writes output/latest.json.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Boxline, type TaskCreateParams, type TaskRun } from "@boxline/sdk";

const out = process.env.OUTPUT_DIR ?? "output";
const changelog = process.env.CHANGELOG_URL;
if (!changelog) throw new Error("Set CHANGELOG_URL to the changelog or release notes page to watch");
const cron = process.env.SCHEDULE ?? "0 8 * * *"; // every day at 08:00 UTC
const keep = process.env.KEEP_SCHEDULE === "1";
const chatHook = process.env.SLACK_WEBHOOK_URL;
const bx = new Boxline();
mkdirSync(out, { recursive: true });

interface Entry {
  version: string;
  date: string;
  title: string;
  changes: string[];
  summary: string;
}

const name = `Changelog watcher: ${new URL(changelog).host}`.slice(0, 100);
const spec: TaskCreateParams = {
  name,
  instruction:
    "Open %changelog% and find the newest RELEASED entry of the changelog (skip anything marked unreleased or upcoming). " +
    "Give its version, its release date as YYYY-MM-DD, its title, the list of changes exactly as written, and a " +
    "one-sentence summary of what is new.",
  variables: [{ name: "changelog", default: changelog, description: "The changelog page" }],
  output: {
    type: "object",
    properties: {
      version: { type: "string", minLength: 1 },
      date: { type: "string", description: "YYYY-MM-DD" },
      title: { type: "string" },
      changes: { type: "array", items: { type: "string" }, minItems: 1 },
      summary: { type: "string" },
    },
    required: ["version", "date", "title", "changes", "summary"],
    additionalProperties: false,
  },
  maxSteps: 10,
  schedule: { cron, timezone: "UTC", enabled: true },
};
const existing = (await bx.tasks.list({ limit: 100 })).data.find((t) => t.name === name);
const task = existing ? await bx.tasks.update(existing.id, spec) : await bx.tasks.create(spec);
const schedule = { cron: task.schedule!.cron, nextRunAt: task.schedule!.nextRunAt, setAt: new Date().toISOString() };
console.log(`Task ${task.id} "${name}": runs "${cron}" (UTC), next at ${schedule.nextRunAt}`);

let run: TaskRun<Entry>;
try {
  const started = await bx.tasks.run<Entry>(task.id);
  console.log(`Run ${started.id} (agent run ${started.runId}) · Session: ${started.sessionId}`);
  run = await bx.tasks.waitForRun<Entry>(started, { timeoutMs: 5 * 60_000 });
} finally {
  if (!keep) await bx.tasks.update(task.id, { schedule: { enabled: false } });
}
if (run.status !== "completed" || !run.result) throw new Error(`the run ${run.status}: ${run.error}`);
const entry = run.result;

// New since last time? (A scheduled run would do this in your task_run.finished webhook receiver.)
const stateFile = join(out, "last-seen.json");
const last = existsSync(stateFile) ? (JSON.parse(readFileSync(stateFile, "utf8")) as { version: string }) : null;
const isNew = !last || last.version !== entry.version;
writeFileSync(stateFile, JSON.stringify({ version: entry.version, date: entry.date, seenAt: new Date().toISOString() }, null, 2));
console.log(`${isNew ? "NEW" : "no change"}: ${entry.version} (${entry.date}) ${entry.title}: ${entry.summary}`);
for (const c of entry.changes) console.log(`  - ${c}`);

// A new entry goes to the team's chat, written like a changelog post.
let posted = false;
if (isNew && chatHook) {
  const text = [`New release at ${changelog}: *${entry.version}* (${entry.date}) ${entry.title}`, "", entry.summary, "", ...entry.changes.map((c) => `• ${c}`)].join("\n");
  const res = await fetch(chatHook, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
  posted = res.ok;
  console.log(res.ok ? "Posted the new entry to the chat webhook." : `The chat webhook answered ${res.status}.`);
}

writeFileSync(join(out, "latest.json"), JSON.stringify(entry, null, 2));
writeFileSync(
  join(out, "result.json"),
  JSON.stringify({ changelog, task: { id: task.id, name, schedule, enabledAtEnd: keep }, run: { id: run.id, status: run.status }, entry, isNew, previous: last?.version ?? null, posted, agentRuns: [{ id: run.runId }], made: { tasks: [task.id] } }, null, 2),
);
