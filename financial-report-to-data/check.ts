import { readFileSync } from "node:fs";
import { check, expect, file, readJson, result, site } from "../runner/check-lib.js";

check(() => {
  const r = result();
  const f = readJson("figures.json");
  const text = readFileSync(file("report.txt"), "utf8");
  expect(typeof f.revenueMillions === "number" && typeof f.netIncomeMillions === "number" && f.period, `figures.json does not match the schema: ${JSON.stringify(f)}`);
  const standIn = site();
  if (!standIn) return `${f.company} ${f.period}: revenue ${f.revenueMillions} m, net income ${f.netIncomeMillions} m (${r.report.text})`;
  const want = standIn.expected.figures;
  expect(/q3-2026\.pdf$/.test(r.report.href), `picked ${r.report.href}, not the latest quarter (Q3 2026)`);
  expect(/Quarterly report Q3 2026/.test(text), "report.txt is not the Q3 2026 report's text");
  for (const k of ["revenueMillions", "netIncomeMillions", "dilutedEps", "cashMillions"] as const) {
    expect(Math.abs(Number(f[k]) - want[k]) < 1e-9, `${k} is ${f[k]}, the report says ${want[k]}`);
  }
  expect(/Q3\s*2026/i.test(f.period) && f.company === want.company && f.currency === "USD", `period/company/currency: ${f.period}, ${f.company}, ${f.currency}`);
  return `picked Q3 2026 (listed after Q2 and the annual report); pdftotext → ${f.company} ${f.period}: revenue $${f.revenueMillions} m, net income $${f.netIncomeMillions} m, EPS $${f.dilutedEps}, cash $${f.cashMillions} m, all as printed (${r.model})`;
});
