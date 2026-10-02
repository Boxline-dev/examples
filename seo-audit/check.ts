import { check, expect, readJson, site } from "../runner/check-lib.js";

check(() => {
  const report = readJson<any[]>("report.json");
  expect(report.length >= 1 && report.every((p) => Array.isArray(p.fixes) && typeof p.h1 === "number"), "report.json is empty or malformed");
  if (!site()) return `${report.length} pages audited, ${report.reduce((a, p) => a + p.fixes.length, 0)} things to fix`;

  const byPath = new Map(report.map((p) => [new URL(p.url).pathname, p]));
  const home = byPath.get("/seo");
  const about = byPath.get("/seo/about");
  expect(home && about, `the audit lacks /seo or /seo/about (it has ${[...byPath.keys()].join(", ")})`);
  const want = [
    "title over 60 characters (70)",
    "no meta description",
    "2 H1 headings (want 1)",
    "no og:description",
    "no og:image (shared links show no picture)",
    "no twitter:card",
    "noindex: the page asks search engines not to list it",
    "no canonical link",
    "1 images without alt text",
  ];
  const missed = want.filter((w) => !home.fixes.includes(w));
  expect(!missed.length, `/seo: the audit missed ${missed.join("; ")} (it found ${home.fixes.join("; ")})`);
  expect(home.fixes.length === want.length, `/seo: unexpected fixes ${home.fixes.filter((f: string) => !want.includes(f)).join("; ")}`);
  expect(about.fixes.length === 0, `/seo/about is clean but the audit says: ${about.fixes.join("; ")}`);
  const s = home.suggestedDescription ?? "";
  expect(s.length >= 20 && s.length <= 170 && /widget/i.test(s), `the suggested description for /seo is not a short sentence about widgets: "${s}"`);
  return `/seo: all ${want.length} problems found (long title, no description, 2 H1, no og:description/og:image/twitter:card, noindex, no canonical, image without alt); /seo/about clean; suggested: "${s.slice(0, 70)}"`;
});
