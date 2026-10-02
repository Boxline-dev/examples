import { check, expect, readJson, result } from "../runner/check-lib.js";

check(() => {
  const r = result();
  const p = readJson("product.json");
  expect(typeof p.name === "string" && typeof p.price === "number" && typeof p.inStock === "boolean" && Array.isArray(p.specs), `product.json does not match the schema: ${JSON.stringify(p).slice(0, 200)}`);
  if (/a-light-in-the-attic/.test(r.url)) {
    expect(p.name === "A Light in the Attic", `name "${p.name}"`);
    expect(Math.abs(p.price - 51.77) < 0.001 && /^(GBP|£)$/.test(p.currency), `price ${p.price} ${p.currency}, not 51.77 GBP`);
    expect(p.inStock === true && p.stockCount === 22, `stock ${p.inStock} (${p.stockCount}), not in stock (22)`);
    const upc = p.specs.find((s: any) => /upc/i.test(s.name));
    expect(upc?.value === "a897fe39b1053632", `UPC ${upc?.value}, not a897fe39b1053632`);
  }
  return `product.json: "${p.name}", ${p.price} ${p.currency}, in stock ${p.inStock} (${p.stockCount}), ${p.specs.length} specs incl. UPC; ${r.model}`;
});
