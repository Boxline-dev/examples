import { bytes, check, expect, isPdf, isPng, pdfPages, result } from "../runner/check-lib.js";

check(() => {
  const r = result();
  const n = r.pages.length;
  expect(n >= 1, "no pages were screenshotted");
  const shots = r.pages.map((_: unknown, i: number) => bytes(`shot-${i + 1}.png`));
  expect(shots.every((b: Buffer) => isPng(b) && b.length > 5000), "a screenshot is not a PNG, or is nearly empty");
  const pdf = bytes("report.pdf");
  expect(isPdf(pdf), "report.pdf is not a PDF");
  expect(pdfPages(pdf) === n, `report.pdf has ${pdfPages(pdf)} pages, not ${n}`);
  expect(r.pages.every((p: any) => p.title), "a page has no title (did it load?)");
  return `report.pdf: ${n} pages (${Math.round(pdf.length / 1024)} KB) from ${n} PNG screenshots of ${r.pages.map((p: any) => `"${p.title}"`).join(", ")}`;
});
