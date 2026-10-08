import { check, expect, result } from "../runner/check-lib.js";

check(() => {
  const r = result();
  // The agent's own session: a shell and no browser (no live view).
  expect(r.session.browser === false && r.session.shell === true, `the run's session was ${JSON.stringify(r.session)}, not shell-only`);
  expect(r.session.liveUrl === null, "a shell-only session has no liveUrl");
  // The data file follows the rule, row by row (the example checked it against the rule itself).
  expect(r.csv.rows === 240 && r.csv.matchesRule, `sales.csv: ${r.csv.rows} rows, matches the rule: ${r.csv.matchesRule}`);
  // The statistics the agent wrote are the ones the rule gives (to a cent).
  const near = (a: unknown, b: number, what: string) => expect(typeof a === "number" && Math.abs(a - b) <= 0.011, `${what}: the agent wrote ${JSON.stringify(a)}, the rule gives ${b}`);
  const want = r.expected;
  const got = r.reported;
  expect(got.total_units === want.total_units, `total_units: ${got.total_units}, expected ${want.total_units}`);
  near(got.total_revenue, want.total_revenue, "total_revenue");
  for (const region of Object.keys(want.revenue_by_region)) near(got.revenue_by_region?.[region], want.revenue_by_region[region], `revenue_by_region.${region}`);
  expect(got.top_region === want.top_region, `top_region: ${got.top_region}, expected ${want.top_region}`);
  near(got.units_mean, want.units_mean, "units_mean");
  near(got.units_median, want.units_median, "units_median");
  near(got.units_stdev, want.units_stdev, "units_stdev");
  // The report names them.
  const text = String(r.report).replace(/,/g, "");
  expect(text.includes(want.total_revenue.toFixed(2)), `report.md does not show the total revenue ${want.total_revenue.toFixed(2)}`);
  expect(text.toLowerCase().includes(want.top_region), `report.md does not name the top region (${want.top_region})`);
  // It was done in the shell, with Python.
  expect(r.toolSteps.some((s: any) => s.name === "bash" && /python/.test(JSON.stringify(s.input))), "the agent never ran Python in the shell");
  return `shell-only session (browser ${r.session.browser}, liveUrl ${r.session.liveUrl}); ${r.csv.rows} rows as the rule says; total revenue ${want.total_revenue}, top region ${want.top_region}, mean ${want.units_mean}, median ${want.units_median}, stdev ${want.units_stdev} all match the agent's stats.json and report.md (${r.toolSteps.length} tool steps)`;
});
