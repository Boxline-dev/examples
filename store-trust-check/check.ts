import { check, expect, result, site, size } from "../runner/check-lib.js";

check(() => {
  const r = result();
  expect(Array.isArray(r.stores) && r.stores.length > 0 && size("report.md") > 100, "no stores scored or report.md missing");
  for (const s of r.stores) expect(["low", "medium", "high"].includes(s.risk) && s.score === s.signals.reduce((n: number, x: any) => n + x.points, 0), `a bad score for ${s.store}`);
  const st = site();
  if (!st) return r.stores.map((s: any) => `${s.store}: ${s.risk} (${s.score})`).join("; ");
  // The stand-in: an honest ceramics shop, and a "mega deals" page with every warning sign.
  const [a, b] = r.stores;
  expect(a.risk === "low" && a.facts.business.address && a.facts.returnsPolicy.present && a.facts.privacyPolicy, `the honest shop should be low risk with its address and policies: ${a.risk}, ${JSON.stringify(a.signals)}`);
  expect(b.risk === "high", `the scam page should be high risk, got ${b.risk} (${b.score})`);
  const why = b.signals.map((x: any) => x.why).join(" | ");
  for (const w of ["no business address", "returns or refund", "cannot dispute", "pressure tactics"]) expect(why.includes(w), `the scam page's signals lack "${w}": ${why}`);
  return `Fernhill Ceramics: low (${a.score}: ${a.signals.map((x: any) => x.why).join(", ") || "none"}); MEGA DEALS 4U: high (${b.score}): ${b.signals.length} signs`;
});
