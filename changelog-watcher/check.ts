import { check, expect, readJson, result, site } from "../runner/check-lib.js";

const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").split(/\s+/).filter(Boolean);

check(() => {
  const r = result();
  const next = Date.parse(r.task.schedule.nextRunAt);
  const setAt = Date.parse(r.task.schedule.setAt);
  expect(Number.isFinite(next) && next > setAt - 5_000 && next - setAt <= 24 * 3_600_000 + 5_000, `nextRunAt ${r.task.schedule.nextRunAt} is not within a day after the schedule was set`);
  if (r.task.schedule.cron === "0 8 * * *") expect(new Date(next).getUTCHours() === 8 && new Date(next).getUTCMinutes() === 0, `nextRunAt ${r.task.schedule.nextRunAt} is not 08:00 UTC`);
  expect(r.run.status === "completed", `the run ${r.run.status}`);
  const e = readJson("latest.json");
  expect(e.version && /^\d{4}-\d{2}-\d{2}$/.test(e.date) && e.changes.length >= 1 && e.summary, `latest.json is incomplete: ${JSON.stringify(e)}`);
  expect(r.isNew === true && r.previous === null, "a first look must report the entry as new");
  const standIn = site();
  if (!standIn) return `newest entry ${e.version} (${e.date}) "${e.title}", ${e.changes.length} changes`;
  const want = standIn.expected.changelog;
  expect(e.version === want.version && e.date === want.date, `got ${e.version} (${e.date}), the newest released entry is ${want.version} (${want.date}); the unreleased section comes first`);
  expect(e.changes.length === want.changes.length, `${e.changes.length} changes, the entry has ${want.changes.length}`);
  for (const c of want.changes) {
    expect(e.changes.some((g: string) => words(c).every((w) => words(g).includes(w))), `the change "${c}" is missing: ${JSON.stringify(e.changes)}`);
  }
  // The stand-in's chat webhook got the new entry once, with its version and every change.
  const posted = standIn.records.chat as { text: string }[];
  expect(posted.length === 1 && r.posted === true, `one message should reach the chat webhook; it got ${posted.length}`);
  expect(posted[0]!.text.includes(want.version) && want.changes.every((c: string) => words(c).every((w) => words(posted[0]!.text).includes(w))), `the chat message lacks the version or a change: ${posted[0]!.text}`);
  return `scheduled "${r.task.schedule.cron}", next ${r.task.schedule.nextRunAt}; newest released entry ${e.version} (${e.date}) "${e.title}" with its ${e.changes.length} changes, the unreleased section skipped; reported as new and posted to the chat webhook`;
});
