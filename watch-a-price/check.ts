import { check, expect, result } from "../runner/check-lib.js";

check(async () => {
  const r = result();
  // The schedule: the next run is in the future, on the cron's grid (the default "0 * * * *": on the hour, within an hour).
  const next = Date.parse(r.task.schedule.nextRunAt);
  const setAt = Date.parse(r.task.schedule.setAt);
  expect(Number.isFinite(next) && next > setAt - 5_000, `nextRunAt ${r.task.schedule.nextRunAt} is not after the schedule was set (${r.task.schedule.setAt})`);
  if (r.task.schedule.cron === "0 * * * *") {
    expect(new Date(next).getUTCMinutes() === 0 && new Date(next).getUTCSeconds() === 0 && next - setAt <= 3_600_000 + 5_000, `nextRunAt ${r.task.schedule.nextRunAt} is not the next full hour`);
  }
  expect(r.task.enabledAtEnd === false || process.env.KEEP_SCHEDULE === "1", "the schedule was left on with no receiver");

  // Every run completed with an answer in the schema, and its webhook arrived, signed, with the same result.
  expect(r.runs.length >= 1, "no task runs");
  for (const run of r.runs) {
    const p = run.result;
    expect(run.status === "completed" && p && typeof p.price === "number" && typeof p.inStock === "boolean" && p.title && p.currency, `run ${run.taskRunId}: ${run.status}, ${JSON.stringify(p)}`);
  }
  expect(r.deliveries.length === r.runs.length, `${r.deliveries.length} webhooks for ${r.runs.length} runs`);
  r.runs.forEach((run: any, i: number) => {
    const d = r.deliveries[i];
    expect(d.taskRunId === run.taskRunId && d.status === "completed" && d.price === run.result.price, `webhook ${i + 1} does not match run ${run.taskRunId}: ${JSON.stringify(d)}`);
  });
  // The receiver's comparison: the first price is new, each later one is compared with the one before.
  expect(r.deliveries[0].changed === null, `the first webhook compared with an earlier price: ${r.deliveries[0].message}`);
  for (let i = 1; i < r.deliveries.length; i++) {
    const d = r.deliveries[i];
    expect(d.previous === r.deliveries[i - 1].price && d.changed === (d.price !== d.previous), `webhook ${i + 1}: ${d.message} (previous ${d.previous})`);
  }
  if (/sapiens-a-brief-history-of-humankind/.test(r.productUrl)) {
    const html = await fetch(r.productUrl).then((x) => x.text());
    const price = Number(/price_color">£([\d.]+)</.exec(html)?.[1]);
    expect(r.runs.every((run: any) => Math.abs(run.result.price - price) < 1e-9 && run.result.inStock === true), `the runs' price is not the site's £${price}`);
  }
  return `task "${r.task.name}" scheduled "${r.task.schedule.cron}", next ${r.task.schedule.nextRunAt}; ${r.runs.length} runs → ${r.deliveries.length} signed task_run.finished webhooks: ${r.deliveries.map((d: any) => d.message).join(" / ")}; schedule ${r.task.enabledAtEnd ? "left on" : "switched off at the end"}`;
});
