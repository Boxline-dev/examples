import { check, expect, result, site } from "../runner/check-lib.js";

check(() => {
  const r = result();
  // The script the agent wrote, run again by the example: it works and prints JSON.
  expect(r.run.exitCode === 0, `client.py exited with ${r.run.exitCode}: ${r.run.stderr.trim().split("\n").at(-1)}`);
  expect(r.run.output !== null, "client.py did not print JSON");
  // The agent read the docs in the browser and worked in the shell.
  const names = new Set(r.toolSteps.map((s: any) => s.name));
  expect([...names].some((n) => String(n).startsWith("browser_")), "the agent never used the browser to read the docs");
  expect(names.has("bash") && r.toolSteps.some((s: any) => s.name === "bash" && s.input.includes("client.py")), "the agent never ran client.py");

  const standIn = site();
  if (!standIn) {
    const text = JSON.stringify(r.run.output);
    for (const code of ["USD", "GBP", "JPY"]) expect(!/USD|GBP|JPY/.test(r.goal) || text.includes(code), `the output has no ${code}`);
    return `client.py (${r.scriptLines} lines) runs and prints JSON for "${r.goal.slice(0, 60)}…"; endpoints: ${r.agent.endpoints.join(", ")}`;
  }

  // The stand-in's made-up API: the exact answer, the key sent, every page of the station list followed.
  const want = standIn.expected.tideApi;
  const rows = (Array.isArray(r.run.output) ? r.run.output : Object.values(r.run.output).find(Array.isArray)) as any[] | undefined;
  expect(rows, `the output is not a list: ${JSON.stringify(r.run.output).slice(0, 200)}`);
  const byStation = new Map(rows.map((x) => [x.station ?? x.id ?? x.stationId, x]));
  for (const w of want.answer) {
    const got = byStation.get(w.station);
    expect(got, `no ${w.station} in the output (did it follow the "next" cursor?)`);
    expect(got.time === w.time && Number(got.heightM ?? got.height) === w.heightM, `${w.station}: ${JSON.stringify(got)}, expected ${w.time} ${w.heightM} m`);
  }
  expect(rows.length === want.answer.length, `${rows.length} stations in the output; the north region has ${want.answer.length}`);
  const calls = standIn.records.api.filter((a: any) => a.path.startsWith("/tide-api/"));
  expect(calls.some((a: any) => a.ok && a.path.includes("cursor=")), "the station list's second page was never asked for");
  return `the made-up tide API, from its docs alone: ${want.answer.map((a: any) => `${a.station} ${a.time} ${a.heightM} m`).join(", ")}; key header sent, cursor followed (${calls.length} calls, ${calls.filter((a: any) => !a.ok).length} refused while it learned); ${r.scriptLines}-line client.py`;
});
