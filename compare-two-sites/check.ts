import { bytes, check, expect, isPng, result, site, size } from "../runner/check-lib.js";

check(() => {
  const r = result();
  for (const k of ["a", "b"]) {
    const s = r[k];
    expect(s && s.name && s.headline && Array.isArray(s.features) && s.features.length > 0, `site ${k} is incomplete: ${JSON.stringify(s).slice(0, 200)}`);
    const png = bytes(`${k}.png`);
    expect(isPng(png) && png.length > 5000, `${k}.png is not a real screenshot (${png.length} bytes)`);
  }
  expect(r.pages.length === 2 && r.pages.every((p: any) => p.status === 200), `both pages should load: ${JSON.stringify(r.pages.map((p: any) => p.status))}`);
  expect(r.summary?.length > 40 && size("report.md") > 400, "the summary or report.md is missing");
  const st = site();
  if (!st) return `${r.a.name} vs ${r.b.name}: ${r.shared.length} shared features, cheaper: ${r.cheaper}; 2 screenshots`;
  // The stand-in rivals: names, prices, features and which one is cheaper are known.
  const want = st.expected.rivals;
  const low = (x: string[]) => x.map((f) => f.toLowerCase()).join(" | ");
  for (const k of ["a", "b"] as const) {
    expect(r[k].name === want[k].name, `site ${k} should be ${want[k].name}, got ${r[k].name}`);
    expect(r[k].pricing.includes(want[k].price.split(" ")[0]), `${want[k].name}'s price should be ${want[k].price}, got "${r[k].pricing}"`);
    for (const f of want[k].features) expect(low(r[k].features).includes(f.toLowerCase()), `${want[k].name} lacks the feature "${f}": ${r[k].features.join(", ")}`);
  }
  expect(r.cheaper === "a", `Ledgerly ($29) is cheaper than Tallybook ($49), got "${r.cheaper}"`);
  expect(low(r.shared).includes("bank sync"), `"Bank sync" is in both: shared = ${r.shared.join(", ")}`);
  expect(low(r.onlyB).includes("payroll") && !low(r.onlyA).includes("payroll"), `payroll is only Tallybook's: onlyA = ${r.onlyA.join(", ")}, onlyB = ${r.onlyB.join(", ")}`);
  return `Ledgerly $29 vs Tallybook $49 (cheaper: Ledgerly), every feature found, shared: bank sync, only Tallybook: payroll; 2 screenshots`;
});
