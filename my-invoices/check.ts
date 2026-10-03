import { bytes, check, expect, isPdf, result, site } from "../runner/check-lib.js";

check(() => {
  const r = result();
  for (const inv of r.invoices) expect(isPdf(bytes(inv.file)) && bytes(inv.file).length === inv.bytes, `${inv.file} is not the PDF that was downloaded`);
  expect(r.invoices.every((i: any) => i.date >= r.since), "an invoice older than the period was downloaded");
  const standIn = site();
  if (!standIn) return `${r.invoices.length} invoices since ${r.since} downloaded as PDFs`;
  const want = standIn.expected.invoices.filter((i: any) => i.date >= r.since).map((i: any) => i.id).sort();
  const got = r.invoices.map((i: any) => i.id).sort();
  expect(want.length === 3 && JSON.stringify(got) === JSON.stringify(want), `downloaded ${got.join(", ")}, want ${want.join(", ")}`);
  const served = [...standIn.records.invoicesServed].sort();
  expect(JSON.stringify(served) === JSON.stringify(want), `the site served ${served.join(", ")} (only the last 3 months, to a signed-in browser)`);
  expect(r.invoices.every((i: any) => i.file === `invoices/${i.id}.pdf` && bytes(i.file).toString("latin1").includes(`Invoice ${i.id}`)), "a downloaded file is not its invoice");
  return `signed in by the profile (no sign-in page); downloaded ${got.join(", ")} (since ${r.since}) as PDFs through the browser; the older invoice was left alone`;
});
