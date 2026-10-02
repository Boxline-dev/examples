import { readFileSync } from "node:fs";
import { check, expect, file, result } from "../runner/check-lib.js";

check(() => {
  const r = result();
  const rows = readFileSync(file("items.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const csv = readFileSync(file("items.csv"), "utf8").trim().split("\n");
  expect(rows.length === r.matched.length && rows.length >= 10, `one row per matched page expected (${r.matched.length}), got ${rows.length}`);
  expect(csv.length === rows.length + 1, `items.csv has ${csv.length - 1} rows, items.jsonl ${rows.length}`);
  const matched = new Set(r.matched);
  for (const x of rows) {
    expect(matched.has(x.url), `a row for a page that was not crawled: ${x.url}`);
    expect(x.price > 0 && x.currency.length === 3 && (x.rating === null || (x.rating >= 1 && x.rating <= 5)), `a bad row: ${JSON.stringify(x)}`);
  }
  expect(new Set(rows.map((x) => x.url)).size === rows.length, "two rows for the same page");
  expect(r.verified >= rows.length * 0.9, `only ${r.verified} of ${rows.length} prices are on their page`);
  const light = rows.find((x) => x.title === "A Light in the Attic");
  if (r.start.includes("poetry_23")) expect(light && light.price === 51.77 && light.currency === "GBP" && light.stockCount === 22, `"A Light in the Attic" should be 51.77 GBP, 22 in stock: ${JSON.stringify(light)}`);
  return `${rows.length} pages crawled and extracted, ${r.verified} prices verified on their page; A Light in the Attic: £51.77, 22 in stock`;
});
