import { readFileSync } from "node:fs";
import { check, expect, file, result, site } from "../runner/check-lib.js";

check(() => {
  const r = result();
  const csv = readFileSync(file("report.csv"), "utf8");
  const sum = csv.trim().split("\n").slice(1).reduce((a, line) => a + Number(line.split(",")[1]), 0);
  const total = readFileSync(file("total.txt"), "utf8").trim();
  expect(total === String(sum), `total.txt holds ${total}, but the report's revenue adds up to ${sum}`);
  expect(r.pageSays.includes(total), `the form page did not echo the total: ${r.pageSays.slice(0, 200)}`);
  const standIn = site();
  if (standIn) {
    expect(total === standIn.expected.reportTotal, `total ${total}, not the stand-in report's ${standIn.expected.reportTotal}`);
    expect(standIn.records.totals.includes(total), `the form received ${JSON.stringify(standIn.records.totals)}, not ${total}`);
  }
  return `downloaded ${r.report} (${csv.trim().split("\n").length - 1} rows); Python's total ${total} matches the CSV; the form ${standIn ? `received ${total}` : "echoed it"}`;
});
