import { check, expect, result, size } from "../runner/check-lib.js";

check(() => {
  const r = result();
  expect(r.product?.name && r.alternatives.length >= 2 && size("alternatives.md") > 100, `no product or too few alternatives: ${JSON.stringify(r).slice(0, 200)}`);
  for (let i = 1; i < r.alternatives.length; i++) expect(r.alternatives[i - 1].similarity >= r.alternatives[i].similarity, "the alternatives are not ranked by similarity");
  for (const a of r.alternatives) {
    expect(r.candidates.includes(a.url), `an alternative from a page that was not a candidate: ${a.url}`);
    if (a.priceDiff !== null) expect(Math.abs(a.priceDiff - (a.price - r.product.price)) < 0.01, `a wrong price difference for ${a.name}`);
  }
  if (!r.product.url.includes("a-light-in-the-attic")) return `${r.product.name}: ${r.alternatives.length} alternatives, the closest ${r.alternatives[0].name}`;
  // The demo: three poetry books and one travel book as candidates for a poetry book.
  expect(r.product.price === 51.77 && r.product.currency === "GBP", `A Light in the Attic costs £51.77: ${r.product.price} ${r.product.currency}`);
  const travel = r.alternatives.findIndex((a: any) => /himalayas/i.test(a.name));
  const poetry = r.alternatives.filter((a: any) => !/himalayas/i.test(a.name));
  expect(poetry.length === 3, `the 3 poetry books should be alternatives: ${r.alternatives.map((a: any) => a.name).join(", ")}`);
  expect(travel === -1 || travel === r.alternatives.length - 1, `the travel book should rank last (or be left out): ${r.alternatives.map((a: any) => `${a.name} ${a.similarity}`).join(", ")}`);
  return `3 poetry books ranked above the travel book (${travel === -1 ? "left out" : "last"}); prices and differences from £51.77: ${poetry.map((a: any) => `${a.name} ${a.priceDiff > 0 ? "+" : ""}${a.priceDiff}`).join(", ")}`;
});
