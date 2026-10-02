import { check, expect, result } from "../../runner/check-lib.js";

check(async () => {
  const r = result();
  expect(r.actions.length >= 1, "Claude sent no computer actions");
  expect(r.actions.some((a: any) => /click/.test(a.action)), `no click among the actions: ${r.actions.map((a: any) => a.action).join(", ")}`);
  if (!process.env.TASK) {
    // The cheapest Poetry book, read from the demo shop itself.
    const html = await fetch("https://books.toscrape.com/catalogue/category/books/poetry_23/index.html").then((x) => x.text());
    const books = [...html.matchAll(/title="([^"]+)">[\s\S]*?price_color">£([\d.]+)</g)].map((m) => ({ title: m[1]!.replace(/&#39;/g, "'").replace(/&amp;/g, "&"), price: Number(m[2]) }));
    const want = books.sort((a, b) => a.price - b.price)[0]!;
    expect(r.answer.includes(want.price.toFixed(2)) && r.answer.toLowerCase().includes(want.title.toLowerCase().slice(0, 16)), `the answer is not ${want.title} £${want.price}: ${r.answer.slice(0, 200)}`);
    return `${r.model} drove the session through /computer with ${r.actions.length} actions and found ${want.title} £${want.price.toFixed(2)}; ${r.usage.ownModelTokens} tokens on your key`;
  }
  return `${r.model}, ${r.actions.length} actions: ${r.answer.slice(0, 100)}`;
});
