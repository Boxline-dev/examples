import { readFileSync } from "node:fs";
import { check, expect, file, result } from "../runner/check-lib.js";

const DEFAULT_PAGE = "https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html";
const norm = (s: string) => s.toLowerCase().replace(/[*_`#>|\\[\]()]/g, " ").replace(/\s+/g, " ").trim();

check(() => {
  const r = result();
  expect(Array.isArray(r.turns) && r.turns.length > 0, "no answers in result.json");
  const page = norm(readFileSync(file("page.md"), "utf8"));
  expect(page.length > 200, `page.md is too short (${page.length} characters)`);
  // Every answer the page supports quotes words that really are on the page.
  for (const t of r.turns) {
    expect(typeof t.answer === "string" && t.answer.trim(), `an empty answer to "${t.question}"`);
    if (t.found) expect(t.quote && page.includes(norm(t.quote)), `the quote for "${t.question}" is not on the page: "${t.quote}"`);
  }
  if (r.url !== DEFAULT_PAGE) return `${r.turns.length} answers about ${r.finalUrl}, each quote found on the page`;
  // The runner's questions about the demo book page: its price, its stock, and something the page does not say.
  const [price, stock, unknown] = r.turns;
  expect(r.turns.length === 3, `3 answers expected, got ${r.turns.length}`);
  expect(/51\.77/.test(price.answer), `the price should be £51.77: "${price.answer}"`);
  expect(/\b22\b/.test(stock.answer), `22 should be in stock: "${stock.answer}"`);
  expect(unknown.found === false, `the page has no publisher phone number, yet the answer was "${unknown.answer}"`);
  return `price £51.77, 22 in stock, "not on the page" for the phone number; quotes found on the page`;
});
