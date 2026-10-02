import { bytes, check, expect, isPng, result, site } from "../runner/check-lib.js";

check(() => {
  const r = result();
  expect(r.seen?.text && r.cta && r.agentRuns?.[0]?.id, `no CTA identified and measured: ${JSON.stringify(r).slice(0, 200)}`);
  expect(r.cta.width > 0 && r.cta.contrast > 0 && r.suggestions.length > 0 && isPng(bytes("hero.png")), "the measurements, suggestions or screenshot are missing");
  if (!site()) return `"${r.cta.text}": ${r.cta.width}×${r.cta.height}, contrast ${r.cta.contrast}:1, ${r.problems.length} problems; ${r.suggestions.length} suggestions`;
  // The stand-in landing page: "Start free trial", white on light blue (about 1.7:1), linking to the sign-up page.
  expect(r.cta.text === "Start free trial", `the main CTA is "Start free trial"; the agent saw "${r.seen.text}", the page's element says "${r.cta.text}"`);
  expect(r.cta.contrast < 2 && r.problems.some((p: string) => /contrast/.test(p)), `the CTA's contrast (about 1.7:1) should be a problem: ${r.cta.contrast}, ${r.problems.join("; ")}`);
  expect(r.cta.href.endsWith("/landing/signup") && r.link?.status === 200 && r.cta.aboveTheFold, `the CTA should lead to the sign-up page (200) above the fold: ${r.cta.href} ${r.link?.status} ${r.cta.aboveTheFold}`);
  expect(r.suggestions.some((s: string) => /contrast|darker|colou?r/i.test(s)), `no suggestion fixes the colour: ${r.suggestions.join(" | ")}`);
  return `"Start free trial" found by computer use; measured ${r.cta.contrast}:1 contrast (fails), ${r.cta.width}×${r.cta.height} above the fold, link 200; ${r.suggestions.length} suggestions`;
});
