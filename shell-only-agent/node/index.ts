/**
 * Shell-only agent: an agent run in its own session with no browser, only a shell. It generates a CSV by a rule, computes
 * statistics from it with Python and writes a report; then the example reads the files back (`files.readText`) and
 * recomputes every number itself, so the result does not rest on the agent's word.
 *
 *   npx tsx node/index.ts            (BOXLINE_API_KEY; a plan with shell sessions and agent runs)
 *
 * The data is made up by a rule (no site is visited). Writes output/sales.csv, output/stats.json, output/report.md and
 * output/result.json.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Boxline } from "@boxline/sdk";

const out = process.env.OUTPUT_DIR ?? "output";
const bx = new Boxline();

// The rule the agent follows, and the example checks against.
const ROWS = 240;
const REGIONS = ["north", "south", "east", "west"];
const rule = (i: number) => ({ id: i, region: REGIONS[i % 4]!, units: ((i * 37) % 23) + 1, price: 4.5 + (i % 5) * 1.25 });
const round2 = (x: number) => Math.round(x * 100) / 100;

/** The numbers the agent should find, from the rule alone. */
function expectedStats() {
  const rows = Array.from({ length: ROWS }, (_, k) => rule(k + 1));
  const byRegion = Object.fromEntries(REGIONS.map((r) => [r, round2(rows.filter((x) => x.region === r).reduce((s, x) => s + x.units * x.price, 0))]));
  const units = rows.map((x) => x.units).sort((a, b) => a - b);
  const mean = units.reduce((s, u) => s + u, 0) / units.length;
  const mid = units.length / 2;
  return {
    total_units: units.reduce((s, u) => s + u, 0),
    total_revenue: round2(rows.reduce((s, x) => s + x.units * x.price, 0)),
    revenue_by_region: byRegion,
    top_region: Object.entries(byRegion).sort((a, b) => b[1] - a[1])[0]![0],
    units_mean: round2(mean),
    units_median: units.length % 2 ? units[Math.floor(mid)]! : (units[mid - 1]! + units[mid]!) / 2,
    units_stdev: round2(Math.sqrt(units.reduce((s, u) => s + (u - mean) ** 2, 0) / units.length)),
  };
}

const task =
  `Work in /workspace with Python 3 (standard library only). Do these three things, in this order:\n` +
  `1. Write sales.csv with the header "id,region,units,unit_price" and one row for each i from 1 to ${ROWS}: ` +
  `id = i, region = ["north", "south", "east", "west"][i % 4], units = (i * 37) % 23 + 1, unit_price = 4.50 + (i % 5) * 1.25 (two decimals).\n` +
  `2. Read sales.csv back with a Python script and write stats.json with these keys: total_units (integer), total_revenue ` +
  `(the sum of units * unit_price), revenue_by_region (an object with the four regions), top_region (the region with the highest revenue), ` +
  `units_mean, units_median and units_stdev (the population standard deviation, statistics.pstdev). Round every decimal to 2 places.\n` +
  `3. Write report.md: a heading, a table of revenue by region, and one sentence that names the top region and the total revenue ` +
  `with two decimals. Take every number from stats.json.\n` +
  `When all three files exist, reply with one sentence.`;

const started = await bx.agent.run({
  task,
  // The run's own session: no browser, only a shell. keepSession leaves it running so the files can be read.
  session: { browser: false, shell: true, timeout: 900, idleTimeout: 300, userMetadata: { example: "shell-only-agent" } },
  keepSession: true,
  maxSteps: 20,
});
console.log(`Session: ${started.sessionId}`);
console.log(`Agent run ${started.id} (${started.model}) is working in a shell-only session…`);
try {
  const run = await bx.agent.wait(started.id);
  if (run.status !== "completed") throw new Error(`the run ${run.status}: ${run.error ?? "no result"}`);
  const toolSteps = run.steps.filter((s) => s.type === "tool");
  console.log(`The agent finished after ${toolSteps.length} tool steps: ${String(run.result).slice(0, 200)}`);

  // The files the agent wrote, read through the API.
  const files = bx.sessions.files;
  const csv = await files.readText(started.sessionId, "sales.csv");
  const reported = JSON.parse(await files.readText(started.sessionId, "stats.json"));
  const report = await files.readText(started.sessionId, "report.md");

  const lines = csv.trim().split(/\r?\n/); // Python's csv module ends lines with \r\n
  const matchesRule =
    lines[0] === "id,region,units,unit_price" &&
    lines.length === ROWS + 1 &&
    lines.slice(1).every((line, k) => {
      const [id, region, units, price] = line.split(",");
      const want = rule(k + 1);
      return Number(id) === want.id && region === want.region && Number(units) === want.units && Math.abs(Number(price) - want.price) < 1e-9;
    });
  const expected = expectedStats();
  console.log(`sales.csv: ${lines.length - 1} rows${matchesRule ? ", as the rule says" : ", NOT as the rule says"}`);
  console.log(`The agent's total revenue ${reported.total_revenue}, expected ${expected.total_revenue}; top region ${reported.top_region}, expected ${expected.top_region}`);

  // What kind of session the run made.
  const session = (await bx.sessions.get(started.sessionId)).data;
  console.log(`The run's session: browser ${session.browser}, shell ${session.shell}, liveUrl ${session.liveUrl}`);

  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "sales.csv"), csv);
  writeFileSync(join(out, "stats.json"), JSON.stringify(reported, null, 2));
  writeFileSync(join(out, "report.md"), report);
  writeFileSync(
    join(out, "result.json"),
    JSON.stringify(
      {
        csv: { rows: lines.length - 1, matchesRule },
        expected,
        reported,
        report,
        session: { id: session.id, browser: session.browser, shell: session.shell, liveUrl: session.liveUrl },
        toolSteps: toolSteps.map((s) => ({ name: s.name, input: s.input })),
        agentRuns: [{ id: run.id }],
      },
      null,
      2,
    ),
  );
} finally {
  await bx.sessions.stop(started.sessionId).catch(() => undefined);
}
