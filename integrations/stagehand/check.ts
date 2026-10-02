import { check, expect, result } from "../../runner/check-lib.js";

check(async () => {
  const r = result();
  expect(r.act?.success, `act() failed: ${r.act?.message}`);
  expect(/poetry_23/.test(r.url), `act() did not open the Poetry category (the page is ${r.url})`);
  // The category's books, read from the demo shop itself.
  const html = await fetch("https://books.toscrape.com/catalogue/category/books/poetry_23/index.html").then((x) => x.text());
  const want = [...html.matchAll(/title="([^"]+)">[\s\S]*?price_color">£([\d.]+)</g)].map((m) => ({ title: m[1]!.replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"'), price: m[2]! }));
  const first = want.slice(0, 5);
  const got = new Map(r.books.map((b: any) => [String(b.title).toLowerCase().slice(0, 20), String(b.price)]));
  const wrong = first.filter((w) => !String(got.get(w.title.toLowerCase().slice(0, 20)) ?? "").includes(w.price));
  expect(r.books.length === 5 && !wrong.length, `extract() got ${r.books.length} books; wrong or missing: ${wrong.map((m) => m.title).join("; ")}`);
  return `act() clicked into Poetry; extract() read its first 5 books with prices, all matching the site (${first.map((w) => `£${w.price}`).join(", ")}); ${r.model}, ${r.usage.ownModelTokens} tokens on your key`;
});
