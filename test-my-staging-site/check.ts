import { bytes, check, expect, isPng, result, site } from "../runner/check-lib.js";

check(() => {
  const r = result();
  expect(typeof r.exitCode === "number", `the tests did not run: ${r.outputTail?.slice(-200)}`);
  for (const f of r.failures) expect(isPng(bytes(f.screenshot)), `${f.screenshot} is not a PNG`);
  if (!site()) return `tests exited ${r.exitCode}: ${r.passed} passed, ${r.failed} failed; ${r.failures.length} failing pages screenshotted`;
  expect(r.exitCode !== 0, "the tests passed, but the stand-in staging site has a broken page");
  expect(r.passed === 2 && r.failed === 1, `${r.passed} passed and ${r.failed} failed, not 2 and 1`);
  expect(r.failures.length === 1 && /\/staging\/pricing$/.test(r.failures[0].url), `the failing pages are ${r.failures.map((f: any) => f.url).join(", ") || "none"}, not /staging/pricing`);
  expect(r.failures[0].status === 500 && r.failures[0].title === "Server error", `the browser saw ${r.failures[0].status} "${r.failures[0].title}"`);
  return `cloned the site tests over git, ran them against the stand-in staging site: 2 passed, 1 failed; opened /staging/pricing in the browser (HTTP 500, "Server error") and saved ${r.failures[0].screenshot}`;
});
