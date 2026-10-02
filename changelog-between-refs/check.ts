import { check, expect, result, site, size } from "../runner/check-lib.js";

check(() => {
  const r = result();
  const c = r.changelog;
  expect(r.commits?.length > 0 && c?.sections?.length > 0 && c.summary && r.agentRuns?.[0]?.id, `no commits or no changelog: ${JSON.stringify(r).slice(0, 200)}`);
  expect(r.unknownCommits.length === 0, `the changelog cites commits outside ${r.FROM}..${r.TO}: ${r.unknownCommits.join(", ")}`);
  for (const s of c.sections) for (const i of s.items) expect(i.text && i.commits.length > 0, `an item without commits: ${JSON.stringify(i)}`);
  expect(size("CHANGELOG.md") > 50, "CHANGELOG.md is missing");
  const st = site();
  if (!st) return `${r.commits.length} commits ${r.FROM}..${r.TO} → ${c.sections.map((s: any) => `${s.title} ${s.items.length}`).join(", ")}; every citation in range`;
  // The stand-in history: CSV export and webhooks added, VAT rounding fixed; dark mode is after v1.1.0.
  const text = c.sections.flatMap((s: any) => s.items.map((i: any) => i.text)).join(" ");
  expect(r.commits.length === st.expected.changelogRepo.inRange.length, `${st.expected.changelogRepo.inRange.length} commits in v1.0.0..v1.1.0, got ${r.commits.length}`);
  expect(/csv/i.test(text) && /webhook/i.test(text) && /vat|round/i.test(text), `the changelog misses CSV export, webhooks or the VAT fix: ${text}`);
  expect(!/dark mode/i.test(text), "dark mode came after v1.1.0 and must not be in this changelog");
  expect(r.cited.length >= 3, `the feature and fix commits should be cited, got ${r.cited.length}`);
  return `v1.0.0..v1.1.0: ${c.sections.map((s: any) => `${s.title} ${s.items.length}`).join(", ")}; CSV, webhooks and the VAT fix in, dark mode out; ${r.cited.length} commits cited, all in range`;
});
