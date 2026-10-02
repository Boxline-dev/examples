/**
 * Compare models: a small benchmark. The same browser tasks, each with its right answer written down beforehand
 * (tasks.json), are run by two or more models side by side; the example scores every run itself (no model judges) and
 * prints each model's pass rate, time, steps and cost.
 *
 *   npx tsx node/index.ts            (BOXLINE_API_KEY; MODELS, TRIALS, TASKS_FILE)
 *
 * A run that did not pass is sorted, never guessed: model_failure (a wrong answer, no answer, a step, cost or time
 * limit), web_failure (it ended on a bot wall or CAPTCHA page), platform_failure (its session or the server failed) or
 * unclassified. Writes output/result.json, output/runs.jsonl (one line per run, with its steps) and output/summary.md.
 */
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Boxline, type AgentProvider, type AgentRun } from "@boxline/sdk";

interface Condition {
  answerContains?: string;
  answerMatches?: string;
  urlReached?: string;
}
interface Task {
  id: string;
  startUrl: string;
  instruction: string;
  pass: Condition[];
}

const out = process.env.OUTPUT_DIR ?? "output";
const tasksFile = process.env.TASKS_FILE ?? join(dirname(fileURLToPath(import.meta.url)), "..", "tasks.json");
const trials = Number(process.env.TRIALS ?? 1);
const timeLimitMs = 3 * 60_000; // per run
const bx = new Boxline();
const { tasks } = JSON.parse(readFileSync(tasksFile, "utf8")) as { tasks: Task[] };

const catalog = await bx.agent.models();
const all = catalog.providers.filter((p) => p.available).flatMap((p) => p.models.map((m) => ({ provider: p.id as AgentProvider, ...m })));
const wanted = (process.env.MODELS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
let models = wanted.map((id) => {
  const m = all.find((x) => x.id === id);
  if (!m) throw new Error(`${id} is not a configured model (see bx.agent.models())`);
  return m;
});
if (!models.length) {
  const same = all.filter((m) => m.provider === catalog.default.provider);
  const first = same.find((m) => m.id === catalog.default.model) ?? same[0]!;
  const second = same.filter((m) => m.id !== first.id).sort((a, b) => a.pricePerMTok.input - b.pricePerMTok.input)[0] ?? first;
  models = [first, second];
}

// Pages that are a wall in front of the site: the run failed on the web, not because of the model.
const WALL = ["captcha", "verify you are human", "are you a robot", "unusual traffic", "access denied", "attention required", "just a moment", "enable javascript and cookies to continue"];
const MODEL_LIMITS = ["max_steps", "max_cost", "too_many_errors", "no_progress", "output_invalid"];
const PLATFORM = ["server_restarted", "session_timeout", "session_ended", "internal"];
const bare = (u: string) => u.replace(/[#?].*$/, "").replace(/\/$/, "");

function score(task: Task, run: AgentRun, timedOut: boolean) {
  const answer = run.status === "completed" ? String(run.result ?? "") : "";
  const text = JSON.stringify(run.steps.map((s) => [s.input, s.output]));
  const visited = [...new Set((text.match(/https?:\/\/[^\s"'\\)]+/g) ?? []).map(bare))];
  const unmet = task.pass.filter((c) =>
    c.answerContains !== undefined
      ? !answer.toLowerCase().includes(c.answerContains.toLowerCase())
      : c.answerMatches !== undefined
        ? !new RegExp(c.answerMatches, "i").test(answer)
        : !visited.includes(bare(c.urlReached ?? "")),
  );
  if (run.status === "completed" && !unmet.length) return { outcome: "pass", detail: null, visited };
  const lastPages = run.steps.filter((s) => s.type === "tool").slice(-3).map((s) => String(s.output ?? "")).join("\n").toLowerCase();
  if (WALL.some((m) => lastPages.includes(m))) return { outcome: "web_failure", detail: "it ended on a bot wall or CAPTCHA page", visited };
  if (timedOut) return { outcome: "model_failure", detail: `not done in ${timeLimitMs / 60_000} minutes`, visited };
  if (run.status === "completed") return { outcome: "model_failure", detail: answer ? `wrong answer (unmet: ${unmet.map((c) => JSON.stringify(c)).join(", ")})` : "no answer", visited };
  const code = run.errorCode ?? "";
  if (MODEL_LIMITS.includes(code)) return { outcome: "model_failure", detail: `${code}: ${run.error}`, visited };
  if (PLATFORM.includes(code)) return { outcome: "platform_failure", detail: `${code}: ${run.error}`, visited };
  return { outcome: "unclassified", detail: `${run.status} ${code}: ${run.error ?? ""}`.trim(), visited };
}

async function trial(task: Task, m: (typeof models)[number], n: number) {
  const t0 = Date.now();
  const started = await bx.agent.run({ task: `Start at ${task.startUrl}. ${task.instruction} Give the answer in your final message.`, provider: m.provider, model: m.id, maxSteps: 20 });
  console.log(`  ${m.id}: run ${started.id} · Session: ${started.sessionId}`);
  let timedOut = false;
  let run: AgentRun;
  try {
    run = await bx.agent.wait(started.id, { timeoutMs: timeLimitMs });
  } catch {
    timedOut = true;
    await bx.agent.cancel(started.id).catch(() => {});
    run = await bx.agent.wait(started.id, { timeoutMs: 60_000 });
  }
  const s = score(task, run, timedOut);
  return {
    task: task.id,
    trial: n,
    model: m.id,
    provider: m.provider,
    runId: run.id,
    status: run.status,
    pass: s.outcome === "pass",
    outcome: s.outcome,
    detail: s.detail,
    seconds: Math.round((Date.now() - t0) / 100) / 10,
    toolSteps: run.steps.filter((x) => x.type === "tool").length,
    inputTokens: run.usage.inputTokens,
    outputTokens: run.usage.outputTokens,
    costUsd: run.usage.costUsd ?? 0,
    answer: run.status === "completed" ? run.result : run.error,
    visited: s.visited,
    steps: run.steps.filter((x) => x.type === "tool").map((x) => ({ name: x.name, input: x.input, ms: x.ms, isError: x.isError ?? false })),
  };
}

mkdirSync(out, { recursive: true });
writeFileSync(join(out, "runs.jsonl"), "");
const rows: Awaited<ReturnType<typeof trial>>[] = [];
// Task by task, the models side by side: each task's runs see the same web at the same time.
for (const task of tasks) {
  for (let n = 1; n <= trials; n++) {
    console.log(`${task.id}${trials > 1 ? ` (trial ${n})` : ""}`);
    for (const row of await Promise.all(models.map((m) => trial(task, m, n)))) {
      rows.push(row);
      appendFileSync(join(out, "runs.jsonl"), `${JSON.stringify(row)}\n`);
      console.log(`    ${row.model}: ${row.outcome}${row.detail ? ` (${row.detail})` : ""}, ${row.seconds} s, ${row.toolSteps} steps, $${row.costUsd.toFixed(4)}`);
    }
  }
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2) : 0;
};
const summary = models.map((m) => {
  const mine = rows.filter((r) => r.model === m.id);
  const outcomes: Record<string, number> = {};
  for (const r of mine) outcomes[r.outcome] = (outcomes[r.outcome] ?? 0) + 1;
  return {
    model: m.id,
    provider: m.provider,
    passed: mine.filter((r) => r.pass).length,
    runs: mine.length,
    medianSeconds: median(mine.map((r) => r.seconds)),
    medianSteps: median(mine.map((r) => r.toolSteps)),
    costUsd: Math.round(mine.reduce((a, r) => a + r.costUsd, 0) * 10_000) / 10_000,
    outcomes,
  };
});
console.table(summary.map(({ model, passed, runs, medianSeconds, medianSteps, costUsd }) => ({ model, passed: `${passed}/${runs}`, medianSeconds, medianSteps, costUsd })));
const md = [
  `# ${tasks.length} tasks × ${models.length} models × ${trials} trial${trials > 1 ? "s" : ""}`,
  "",
  "| Model | Passed | Median time | Median steps | Cost | Outcomes |",
  "|---|---|---|---|---|---|",
  ...summary.map((s) => `| ${s.model} | ${s.passed}/${s.runs} | ${s.medianSeconds} s | ${s.medianSteps} | $${s.costUsd.toFixed(4)} | ${Object.entries(s.outcomes).map(([k, v]) => `${k} ${v}`).join(", ")} |`),
  "",
  "| Task | " + models.map((m) => m.id).join(" | ") + " |",
  "|---|" + models.map(() => "---|").join(""),
  ...tasks.map((t) => `| ${t.id} | ${models.map((m) => rows.filter((r) => r.task === t.id && r.model === m.id).map((r) => (r.pass ? "pass" : r.outcome)).join(", ")).join(" | ")} |`),
];
writeFileSync(join(out, "summary.md"), `${md.join("\n")}\n`);
writeFileSync(
  join(out, "result.json"),
  JSON.stringify({ tasksFile, tasks, models: models.map((m) => ({ id: m.id, provider: m.provider })), trials, summary, rows: rows.map(({ steps, ...r }) => r), agentRuns: rows.map((r) => ({ id: r.runId })) }, null, 2),
);
