import { check, expect, result } from "../../runner/check-lib.js";

check(async () => {
  const r = result();
  expect(r.done && r.successful !== false, `the agent did not finish: ${r.answer}`);
  expect(r.urls.some((u: string) => /books\.toscrape\.com/.test(u)), `the agent never opened the site: ${r.urls.join(", ")}`);
  if (!process.env.TASK) {
    // The cheapest Poetry book, read from the demo shop itself.
    const html = await fetch("https://books.toscrape.com/catalogue/category/books/poetry_23/index.html").then((x) => x.text());
    const books = [...html.matchAll(/title="([^"]+)">[\s\S]*?price_color">£([\d.]+)</g)].map((m) => ({ title: m[1]!.replace(/&#39;/g, "'").replace(/&amp;/g, "&"), price: Number(m[2]) }));
    const want = books.sort((a, b) => a.price - b.price)[0]!;
    expect(r.answer.includes(want.price.toFixed(2)) && r.answer.toLowerCase().includes(want.title.toLowerCase().slice(0, 16)), `the answer is not ${want.title} £${want.price}: ${r.answer.slice(0, 200)}`);
    return `Browser Use drove the Boxline browser through ${r.urls.length} pages in ${r.steps} steps and found ${want.title} £${want.price.toFixed(2)}`;
  }
  return `Browser Use: ${r.steps} steps: ${r.answer.slice(0, 100)}`;
});
