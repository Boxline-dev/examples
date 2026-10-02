import { check, expect, result, size } from "../runner/check-lib.js";

check(() => {
  const r = result();
  expect(r.ideas?.length >= 3 && size("ideas.md") > 200, `at least 3 ideas expected, got ${r.ideas?.length} (${r.dropped} dropped)`);
  const strip = (u: string) => String(u ?? "").replace(/[#?].*$/, "").replace(/\/$/, "");
  const read = new Set(r.pages.filter((p: any) => !p.error && (p.status ?? 0) < 400).flatMap((p: any) => [p.url, p.finalUrl]).filter(Boolean).map(strip));
  for (const i of r.ideas) {
    expect(read.has(strip(i.source)), `an idea from a page that was not read: ${i.source}`);
    expect(i.why.length > 15, `"${i.idea}" has no reason`);
    if (i.priceMin !== null && (i.currency ?? r.currency) === r.currency) expect(i.priceMin <= r.budget, `"${i.idea}" starts at ${i.priceMin}, over the budget of ${r.budget}`);
  }
  return `${r.ideas.length} ideas for "${r.recipient}" within ${r.budget} ${r.currency}, each from a page that was read: ${r.ideas.slice(0, 3).map((i: any) => i.idea).join("; ")}`;
});
