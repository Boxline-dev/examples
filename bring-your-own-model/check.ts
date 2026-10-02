import { check, expect, result } from "../runner/check-lib.js";

check(() => {
  const r = result();
  const p = r.product;
  expect(p && typeof p.name === "string" && typeof p.price === "number" && typeof p.inStock === "boolean", `the model's JSON does not have the schema's shape: ${JSON.stringify(p)}`);
  expect(r.usage?.ownModelTokens > 0, "no tokens were reported by the model provider");
  if (!r.url.includes("a-light-in-the-attic")) return `${r.model} at ${r.endpoint}: ${p.name}, ${p.price} ${p.currency}; ${r.usage.ownModelTokens} tokens on your key`;
  expect(p.name === "A Light in the Attic" && p.price === 51.77 && p.currency === "GBP" && p.inStock && p.stockCount === 22, `the demo book is £51.77 with 22 in stock: ${JSON.stringify(p)}`);
  return `${r.model} at ${r.endpoint}: A Light in the Attic, £51.77, 22 in stock; ${r.usage.ownModelTokens} tokens billed to your own key`;
});
