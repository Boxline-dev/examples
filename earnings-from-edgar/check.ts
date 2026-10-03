import { readFileSync } from "node:fs";
import { bytes, check, expect, file, isPng, result, site } from "../runner/check-lib.js";

check(() => {
  const r = result();
  expect(r.companies.length === r.tickers.length, `${r.companies.length} companies for ${r.tickers.length} tickers`);
  expect(isPng(bytes("chart.png")), "chart.png is not a PNG");
  const csvRows = readFileSync(file("earnings.csv"), "utf8").trim().split("\n").length - 1;
  const yearRows = r.companies.reduce((n: number, c: any) => n + c.years.length, 0);
  expect(csvRows === yearRows, `earnings.csv has ${csvRows} rows for ${yearRows} company-years`);
  // Growth and margins agree with the revenues and incomes next to them (computed in the shell, checked here).
  for (const c of r.companies) {
    expect(c.years.length >= 3, `${c.ticker}: only ${c.years.length} years`);
    c.years.forEach((y: any, i: number) => {
      expect(i === 0 || y.end > c.years[i - 1].end, `${c.ticker}: years out of order`);
      if (i) expect(Math.abs(y.revenueGrowthPct - 100 * (y.revenue / c.years[i - 1].revenue - 1)) < 0.06, `${c.ticker} ${y.end}: growth ${y.revenueGrowthPct}%`);
      if (y.netIncome !== null) expect(Math.abs(y.netMarginPct - (100 * y.netIncome) / y.revenue) < 0.06, `${c.ticker} ${y.end}: margin ${y.netMarginPct}%`);
    });
  }

  const standIn = site();
  if (!standIn) {
    const c = r.companies[0];
    return `${r.companies.map((x: any) => x.ticker).join(", ")}: ${yearRows} company-years from ${r.requests} EDGAR requests; ${c.ticker} revenue $${(c.years.at(-1).revenue / 1e9).toFixed(1)}B to ${c.years.at(-1).end}`;
  }
  // The stand-in: every year exact, the restated year at its later value, quarters left out, a user agent declared.
  for (const want of standIn.expected.edgar.companies) {
    const got = r.companies.find((c: any) => c.ticker === want.ticker);
    expect(got, `no ${want.ticker}`);
    expect(got.revenueConcept === want.revenueConcept, `${want.ticker}: revenue from ${got.revenueConcept}`);
    expect(got.years.length === want.years.length, `${want.ticker}: ${got.years.length} years (a quarter or a repeated year counted?)`);
    want.years.forEach((w: any, i: number) => {
      const y = got.years[i];
      expect(y.end === w.end && y.revenue === w.revenue && y.netIncome === w.netIncome && y.eps === w.eps, `${want.ticker} ${w.end}: ${JSON.stringify(y)}`);
    });
  }
  const calls = standIn.records.api.filter((a: any) => a.path.startsWith("/edgar/"));
  expect(calls.length > 0 && calls.every((a: any) => a.ok), "a request to EDGAR came without a declared user agent");
  const hr = r.companies.find((c: any) => c.ticker === "HRBR").years;
  const kl = r.companies.find((c: any) => c.ticker === "KLPX").years;
  return `HRBR and KLPX, 4 years each, exact: 2024 at its restated $152.35M (not the first-filed $151.0M), 10-Q quarters left out; growth HRBR ${hr.at(-1).revenueGrowthPct}%, KLPX ${kl[1].revenueGrowthPct}% then ${kl.at(-1).revenueGrowthPct}%; KLPX margin ${kl[0].netMarginPct}% → ${kl.at(-1).netMarginPct}%; ${calls.length} EDGAR calls, all with a declared user agent`;
});
