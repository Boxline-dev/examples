import { check, expect, result } from "../runner/check-lib.js";

/** The cheapest book in the demo shop's Poetry category, read from the site itself. */
async function cheapestPoetry() {
  const html = await fetch("https://books.toscrape.com/catalogue/category/books/poetry_23/index.html").then((x) => x.text());
  const books = [...html.matchAll(/title="([^"]+)">[\s\S]*?price_color">£([\d.]+)</g)].map((m) => ({ title: m[1]!.replace(/&#39;/g, "'").replace(/&amp;/g, "&"), price: Number(m[2]) }));
  return books.sort((a, b) => a.price - b.price)[0]!;
}

check(async () => {
  const r = result();
  expect(r.status === "completed" && r.mode === "computer", `the run ended ${r.status} in ${r.mode} mode`);
  expect(r.computerActions >= 1, "the model never used the computer tool");
  const answer = String(r.answer);
  if (!process.env.TASK) {
    const want = await cheapestPoetry();
    expect(answer.includes(want.price.toFixed(2)) && answer.toLowerCase().includes(want.title.toLowerCase().slice(0, 16)), `the answer is not ${want.title} £${want.price}: ${answer.slice(0, 200)}`);
    return `${r.model} (computer mode) found the cheapest Poetry book, ${want.title} £${want.price.toFixed(2)}, with ${r.computerActions} screen actions`;
  }
  return `${r.model} (computer mode), ${r.computerActions} screen actions: ${answer.slice(0, 100)}`;
});
