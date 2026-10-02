import { check, expect, result, site } from "../runner/check-lib.js";

check(() => {
  const r = result();
  expect(r.rows?.length >= 1, "no rows were submitted");
  expect(r.rows.every((x: any) => x.pageSays.includes(x.name)), `a page after a submit does not show its row's name: ${JSON.stringify(r.rows.map((x: any) => x.pageSays.slice(0, 80)))}`);
  const standIn = site();
  if (!standIn) return `${r.rows.length} rows submitted (${r.rows.map((x: any) => x.name).join(", ")}); each page echoed its row`;
  const want = standIn.expected.sheet.slice(0, 3);
  const got = standIn.records.orders;
  expect(got.length === 3, `the form received ${got.length} submissions, not 3`);
  for (const [i, row] of want.entries()) {
    expect(got[i].name === row.name && got[i].phone === row.phone && got[i].email === row.email, `submission ${i + 1} is ${JSON.stringify(got[i])}, the sheet says ${JSON.stringify(row)}`);
  }
  const reviewedAt = Number(standIn.records.person.reviewedAt);
  expect(reviewedAt && got[0].at > reviewedAt, "the first row was submitted before the person approved it");
  return `the form received rows 1-3 (${want.map((x: any) => x.name).join(", ")}) with the right phone and email, not row 4; the first only after the person's review`;
});
