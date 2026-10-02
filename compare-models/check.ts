import { check, expect, file, result } from "../runner/check-lib.js";
import { readFileSync } from "node:fs";

const OUTCOMES = ["pass", "model_failure", "web_failure", "platform_failure", "unclassified"];
const bare = (u: string) => u.replace(/[#?].*$/, "").replace(/\/$/, "");

check(() => {
  const r = result();
  const want = r.tasks.length * r.models.length * r.trials;
  expect(r.models.length >= 2 && r.rows.length === want, `${r.rows.length} runs, want ${r.tasks.length} tasks × ${r.models.length} models × ${r.trials}`);
  const lines = readFileSync(file("runs.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  expect(lines.length === want && lines.every((l) => Array.isArray(l.steps)), "runs.jsonl needs one line per run, with its steps");
  for (const row of r.rows) {
    const name = `${row.model} on ${row.task}`;
    expect(OUTCOMES.includes(row.outcome) && row.pass === (row.outcome === "pass"), `${name}: outcome ${row.outcome}, pass ${row.pass}`);
    expect(row.outcome !== "platform_failure" && row.outcome !== "unclassified", `${name}: ${row.outcome} (${row.detail}); a platform failure is ours to fix`);
    expect(row.pass || row.detail, `${name} did not pass and says nothing why`);
    expect(row.toolSteps >= 1 && row.inputTokens > 0 && typeof row.costUsd === "number" && row.seconds > 0, `${name}: steps, tokens, cost or time missing`);
    // The score again, from the task's own right answer: the example must not have passed a wrong one (or failed a right one).
    const task = r.tasks.find((t: any) => t.id === row.task);
    const answer = row.status === "completed" ? String(row.answer ?? "") : "";
    const met = task.pass.every((c: any) =>
      c.answerContains !== undefined ? answer.toLowerCase().includes(c.answerContains.toLowerCase()) : c.answerMatches !== undefined ? new RegExp(c.answerMatches, "i").test(answer) : row.visited.includes(bare(c.urlReached)),
    );
    expect(met === row.pass, `${name}: scored ${row.outcome}, but by the task's right answer it ${met ? "passed" : "failed"}: "${answer.slice(0, 160)}"`);
  }
  for (const s of r.summary) {
    const mine = r.rows.filter((x: any) => x.model === s.model);
    expect(s.runs === mine.length && s.passed === mine.filter((x: any) => x.pass).length, `the summary for ${s.model} does not add up`);
    if (!process.env.TASKS_FILE) expect(s.passed >= r.tasks.length - 1, `${s.model} passed ${s.passed} of ${s.runs}: ${mine.filter((x: any) => !x.pass).map((x: any) => `${x.task} ${x.outcome} (${x.detail})`).join("; ")}`);
  }
  expect(/\| Model \| Passed/.test(readFileSync(file("summary.md"), "utf8")), "summary.md has no table");
  return r.summary.map((s: any) => `${s.model}: ${s.passed}/${s.runs} passed, median ${s.medianSeconds} s, ${s.medianSteps} steps, $${Number(s.costUsd).toFixed(4)}`).join(" vs ") + "; every score matches the tasks' right answers";
});
