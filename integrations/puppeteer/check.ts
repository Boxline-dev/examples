import { bytes, check, expect, isPng, result } from "../../runner/check-lib.js";

check(async () => {
  const r = result();
  expect(r.heading === "Poetry" && /poetry_23/.test(r.url), `Puppeteer ended on ${r.url} ("${r.heading}")`);
  // The category's books, read from the demo shop itself.
  const html = await fetch("https://books.toscrape.com/catalogue/category/books/poetry_23/index.html").then((x) => x.text());
  const want = [...html.matchAll(/<h3><a href="[^"]+" title="([^"]+)"/g)].map((m) => m[1]!.replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"'));
  const got = r.books.map((b: any) => b.title);
  expect(JSON.stringify(got) === JSON.stringify(want), `the books differ from the site's: ${got.length} vs ${want.length}`);
  expect(r.books.every((b: any) => /^£\d+\.\d\d$/.test(b.price)), "a book has no £ price");
  const png = bytes("poetry.png");
  expect(isPng(png) && png.length === r.screenshotBytes, "poetry.png is not the screenshot Puppeteer took");
  return `clicked into Poetry: all ${got.length} books with prices match the site; poetry.png ${Math.round(png.length / 1024)} KB`;
});
