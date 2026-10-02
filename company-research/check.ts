import { check, expect, result, size } from "../runner/check-lib.js";

check(() => {
  const r = result();
  expect(typeof r.companyName === "string" && r.companyName.toLowerCase().includes(r.company.toLowerCase()), `the findings are about "${r.companyName}", not ${r.company}`);
  expect(r.overview?.length > 40 && r.findings?.length > 80, "the overview or the findings are missing or too short");
  expect(Array.isArray(r.keyPoints) && r.keyPoints.length >= 3, `at least 3 key points expected, got ${r.keyPoints?.length}`);
  const ok = r.pages.filter((p: any) => p.status !== null && p.status < 400);
  const read = new Set<string>(ok.flatMap((p: any) => [p.url, p.finalUrl]));
  expect(ok.length >= 2, `at least 2 pages should have been read, got ${ok.length}`);
  // Every key point names a page that was really read (not a made-up or search-engine URL).
  const strip = (u: string) => u.replace(/[#?].*$/, "").replace(/\/$/, "");
  const known = new Set([...read].map(strip));
  for (const k of r.keyPoints) expect(known.has(strip(k.source)), `a key point cites a page that was not read: ${k.source}`);
  expect(size("report.md") > 300, "report.md is missing or too short");
  const sources = new Set(r.keyPoints.map((k: any) => strip(k.source))).size;
  if (r.company === "Mozilla" && r.topic === "how it makes money") {
    expect(/search|royalt|google/i.test(`${r.findings} ${r.keyPoints.map((k: any) => k.point).join(" ")}`), "the findings on Mozilla's money do not mention its search deals");
  }
  return `${r.companyName}: ${r.keyPoints.length} key points from ${sources} of ${ok.length} pages read, every source a page that was read`;
});
