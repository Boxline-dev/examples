/**
 * Visual uptime check, in two parts:
 * 1. A load check, no model: each page opened in a real browser and timed. Up, slow (over SLOW_MS), or down: an error
 *    status, or no page at all with the reason (the name does not resolve, a certificate problem, refused, no answer).
 * 2. A task opens each page, takes a screenshot and looks at it, and reports whether it looks broken (an error message,
 *    a blank page, missing images), on a schedule: a page can load fine and still be broken.
 * A screenshot of each page is also saved here for the record.
 *
 *   PAGES=https://…,https://… npx tsx node/index.ts    (BOXLINE_API_KEY; SLOW_MS; SCHEDULE; KEEP_SCHEDULE=1 to leave it running)
 *
 * The example runs the task once right away instead of waiting for the schedule, then switches the schedule off unless
 * KEEP_SCHEDULE=1 (a check every 15 minutes costs a model run each time). Writes output/status.json, output/load.json
 * and output/shots/.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Boxline, type TaskCreateParams, type TaskRun } from "@boxline/sdk";

const out = process.env.OUTPUT_DIR ?? "output";
const pages = (process.env.PAGES ?? "https://books.toscrape.com/,https://quotes.toscrape.com/").split(",").map((p) => p.trim()).filter(Boolean);
const cron = process.env.SCHEDULE ?? "*/15 * * * *";
const keep = process.env.KEEP_SCHEDULE === "1";
const slowMs = Number(process.env.SLOW_MS ?? 5000);
const bx = new Boxline();

// 1. The load check: each page in a real browser, timed (from here, so it includes the trip to the API).
const REASONS: [RegExp, string][] = [
  [/ERR_NAME_NOT_RESOLVED|does not resolve/, "the name does not resolve (DNS)"],
  [/ERR_CERT_|ERR_SSL_/, "a certificate or TLS problem"],
  [/ERR_CONNECTION_REFUSED|refused the connection/, "the server refused the connection"],
  [/ERR_CONNECTION_TIMED_OUT|ERR_TIMED_OUT|could not be reached|timeout/i, "the server did not answer"],
];
interface Load {
  url: string;
  state: "up" | "slow" | "down";
  loadMs: number;
  httpStatus: number | null;
  reason: string | null;
}
const load: Load[] = [];
const browser = await bx.sessions.create({ timeout: 600, userMetadata: { example: "visual-uptime-check" } });
console.log(`Load check · Session: ${browser.id}`);
try {
  for (const url of pages) {
    const t0 = Date.now();
    try {
      const r = await browser.goto(url);
      const loadMs = Date.now() - t0;
      const failed = r.status !== null && r.status >= 400;
      const slow = !failed && loadMs > slowMs;
      load.push({ url, state: failed ? "down" : slow ? "slow" : "up", loadMs, httpStatus: r.status, reason: failed ? `HTTP ${r.status}` : slow ? `${(loadMs / 1000).toFixed(1)} s to load` : null });
    } catch (err) {
      const message = (err as Error).message;
      const why = REASONS.find(([re]) => re.test(message))?.[1];
      const code = /ERR_[A-Z_]+/.exec(message)?.[0];
      load.push({ url, state: "down", loadMs: Date.now() - t0, httpStatus: null, reason: why ? `${code ?? "no page"}: ${why}` : message.replace(/^page\.goto:\s*/, "").slice(0, 200) });
    }
  }
} finally {
  await browser.stop();
}
for (const l of load) console.log(`${l.state.toUpperCase().padEnd(5)} ${String(l.loadMs).padStart(6)} ms  ${l.url}${l.reason ? `  (${l.reason})` : ""}`);
const count = (state: string) => load.filter((l) => l.state === state).length;
console.log(`Load check: ${count("up")} up · ${count("slow")} slow · ${count("down")} down\n`);

interface Status {
  pages: { url: string; httpStatus: number | null; up: boolean; looksBroken: boolean; note: string }[];
}

const name = `Visual uptime check: ${new URL(pages[0]!).host}`.slice(0, 100);
const spec: TaskCreateParams = {
  name,
  instruction:
    "Check each of these pages, one at a time: %pages%. For each one: open it, note the HTTP status, take a screenshot and " +
    "look at it. A page is up when it loads with a 2xx status. It looks broken when the screenshot shows an error message, " +
    "a blank or half-drawn page, or missing images. Describe what you see in one sentence.",
  variables: [{ name: "pages", default: pages.join(", "), description: "The pages to check, comma-separated" }],
  output: {
    type: "object",
    properties: {
      pages: {
        type: "array",
        items: {
          type: "object",
          properties: {
            url: { type: "string" },
            httpStatus: { type: ["integer", "null"] },
            up: { type: "boolean" },
            looksBroken: { type: "boolean" },
            note: { type: "string" },
          },
          required: ["url", "httpStatus", "up", "looksBroken", "note"],
          additionalProperties: false,
        },
      },
    },
    required: ["pages"],
    additionalProperties: false,
  },
  maxSteps: 20,
  schedule: { cron, timezone: "UTC", enabled: true },
};
const existing = (await bx.tasks.list({ limit: 100 })).data.find((t) => t.name === name);
const task = existing ? await bx.tasks.update(existing.id, spec) : await bx.tasks.create(spec);
const schedule = { cron: task.schedule!.cron, nextRunAt: task.schedule!.nextRunAt, setAt: new Date().toISOString() };
console.log(`Task ${task.id} "${name}": runs "${cron}" (UTC), next at ${schedule.nextRunAt}`);

let run: TaskRun<Status>;
try {
  // Run it now instead of waiting for the schedule.
  const started = await bx.tasks.run<Status>(task.id);
  console.log(`Run ${started.id} (agent run ${started.runId}) · Session: ${started.sessionId}`);
  run = await bx.tasks.waitForRun<Status>(started, { timeoutMs: 8 * 60_000 });
} finally {
  if (!keep) await bx.tasks.update(task.id, { schedule: { enabled: false } });
}
if (run.status !== "completed" || !run.result) throw new Error(`the check ${run.status}: ${run.error}`);
for (const p of run.result.pages) console.log(`${p.up ? (p.looksBroken ? "BROKEN" : "up    ") : "DOWN  "}  ${p.httpStatus ?? "–"}  ${p.url}  ${p.note}`);

// A screenshot of each page for the record (one call each, in a fresh browser).
mkdirSync(join(out, "shots"), { recursive: true });
const shots: string[] = [];
for (const [i, url] of pages.entries()) {
  const png = await bx.screenshot(url, { timeoutMs: 30_000 }).catch(() => null);
  if (!png) continue;
  const file = `shots/${i + 1}.png`;
  writeFileSync(join(out, file), png);
  shots.push(file);
}
const agentRun = await bx.agent.get(run.runId!);
const screenshotsTaken = agentRun.steps.filter((s) => s.type === "tool" && (s.name === "browser_screenshot" || s.name === "computer")).length;
console.log(keep ? `The schedule stays on: next run at ${(await bx.tasks.get(task.id)).schedule?.nextRunAt}` : "The schedule is switched off; KEEP_SCHEDULE=1 leaves it on.");

writeFileSync(join(out, "status.json"), JSON.stringify(run.result, null, 2));
writeFileSync(join(out, "load.json"), JSON.stringify(load, null, 2));
writeFileSync(
  join(out, "result.json"),
  JSON.stringify(
    { pages, slowMs, load, task: { id: task.id, name, schedule, enabledAtEnd: keep }, run: { id: run.id, status: run.status, result: run.result, screenshotsTaken }, shots, agentRuns: [{ id: run.runId }], made: { tasks: [task.id] } },
    null,
    2,
  ),
);
