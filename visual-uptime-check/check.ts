import { bytes, check, expect, isPng, readJson, result, site } from "../runner/check-lib.js";

check(() => {
  const r = result();
  const next = Date.parse(r.task.schedule.nextRunAt);
  const setAt = Date.parse(r.task.schedule.setAt);
  expect(Number.isFinite(next) && next > setAt - 5_000, `nextRunAt ${r.task.schedule.nextRunAt} is not after the schedule was set`);
  if (r.task.schedule.cron === "*/15 * * * *") expect(new Date(next).getUTCMinutes() % 15 === 0 && next - setAt <= 15 * 60_000 + 5_000, `nextRunAt ${r.task.schedule.nextRunAt} is not the next quarter hour`);
  expect(r.run.status === "completed", `the run ${r.run.status}`);
  expect(r.run.screenshotsTaken >= 1, "the task never took a screenshot to look at");
  const status = readJson<{ pages: { url: string; httpStatus: number | null; up: boolean; looksBroken: boolean; note: string }[] }>("status.json");
  expect(status.pages.length === r.pages.length, `${status.pages.length} pages reported, ${r.pages.length} asked`);
  for (const f of r.shots) expect(isPng(bytes(f)), `${f} is not a PNG`);
  expect(r.load.length === r.pages.length && r.load.every((l: any) => ["up", "slow", "down"].includes(l.state) && l.loadMs > 0), "the load check must time every page");
  if (!site()) return `${status.pages.filter((p) => p.up && !p.looksBroken).length} of ${status.pages.length} pages up and fine`;

  // The load check (no model): it sees status, time and failures, not how the page looks.
  const loaded = (path: string) => r.load.find((l: any) => new URL(l.url).pathname === path && new URL(l.url).host === new URL(site()!.url).host);
  const nowhere = r.load.find((l: any) => l.url.includes("does-not-exist.invalid"));
  expect(loaded("/uptime/")?.state === "up" && loaded("/uptime/")?.httpStatus === 200, `load: /uptime/ should be up: ${JSON.stringify(loaded("/uptime/"))}`);
  expect(loaded("/uptime/pricing")?.state === "up", `load: /uptime/pricing loads (its breakage is for the screenshot to see): ${JSON.stringify(loaded("/uptime/pricing"))}`);
  expect(loaded("/uptime/status")?.state === "down" && loaded("/uptime/status")?.reason === "HTTP 503", `load: /uptime/status is down with 503: ${JSON.stringify(loaded("/uptime/status"))}`);
  expect(loaded("/uptime/slow")?.state === "slow" && loaded("/uptime/slow")!.loadMs >= 6000, `load: /uptime/slow takes 6.2 s: ${JSON.stringify(loaded("/uptime/slow"))}`);
  expect(nowhere?.state === "down" && nowhere.httpStatus === null && /ERR_/.test(nowhere.reason), `load: the host that does not exist is down with Chrome's reason: ${JSON.stringify(nowhere)}`);
  const by = (path: string) => status.pages.find((p) => new URL(p.url).pathname === path)!;
  const ok = by("/uptime/");
  const broken = by("/uptime/pricing");
  const down = by("/uptime/status");
  const slow = by("/uptime/slow");
  const missing = status.pages.find((p) => p.url.includes("does-not-exist.invalid"));
  expect(ok && ok.up && !ok.looksBroken && ok.httpStatus === 200, `/uptime/ is fine, but the task said ${JSON.stringify(ok)}`);
  expect(broken && broken.up && broken.looksBroken, `/uptime/pricing loads but shows an error, the task said ${JSON.stringify(broken)}`);
  expect(down && !down.up && down.httpStatus === 503, `/uptime/status is down (503), the task said ${JSON.stringify(down)}`);
  expect(slow && slow.up && !slow.looksBroken, `/uptime/slow is slow but fine, the task said ${JSON.stringify(slow)}`);
  expect(missing && !missing.up, `the host that does not exist is down, the task said ${JSON.stringify(missing)}`);
  expect(r.shots.length === 4, `${r.shots.length} screenshots saved, not 4 (every page but the one that does not exist)`);
  return `load: / up, /pricing up, /status down (503), /slow slow (${(loaded("/uptime/slow").loadMs / 1000).toFixed(1)} s), no-such-host down (${nowhere.reason}); scheduled "${r.task.schedule.cron}"; the task took ${r.run.screenshotsTaken} screenshots: /pricing broken ("${broken.note.slice(0, 50)}"), /status and no-such-host down, / and /slow fine; 4 PNGs saved`;
});
