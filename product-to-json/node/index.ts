/**
 * Product page to JSON: pull name, price, stock and specs from a product page into a fixed shape (a JSON Schema).
 *
 *   npx tsx node/index.ts            (BOXLINE_API_KEY; PRODUCT_URL for your own product page)
 *
 * Writes output/product.json.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Boxline } from "@boxline/sdk";

const out = process.env.OUTPUT_DIR ?? "output";
const url = process.env.PRODUCT_URL ?? "https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html";
const bx = new Boxline();

interface Product {
  name: string;
  price: number;
  currency: string;
  inStock: boolean;
  stockCount: number | null;
  specs: { name: string; value: string }[];
}

// The page renders in a real browser inside a sandbox; a model fills the schema (page text is treated as data).
const { data, pages, model, usage } = await bx.extract<Product>({
  url,
  prompt: "The product on this page. specs: the rows of its product information table.",
  schema: {
    type: "object",
    properties: {
      name: { type: "string" },
      price: { type: "number", description: "the price as a number, without the currency" },
      currency: { type: "string", description: "ISO 4217 code, e.g. GBP" },
      inStock: { type: "boolean" },
      stockCount: { type: ["integer", "null"], description: "how many are available, when the page says" },
      specs: { type: "array", items: { type: "object", properties: { name: { type: "string" }, value: { type: "string" } }, required: ["name", "value"] } },
    },
    required: ["name", "price", "currency", "inStock", "stockCount", "specs"],
  },
});

console.log(`${data.name}: ${data.price} ${data.currency}, ${data.inStock ? `in stock (${data.stockCount ?? "?"})` : "out of stock"}, ${data.specs.length} specs`);
console.log(`Read ${pages[0]!.finalUrl} (HTTP ${pages[0]!.status}) with ${model} for $${usage.costUsd.toFixed(4)}`);
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "product.json"), JSON.stringify(data, null, 2));
writeFileSync(join(out, "result.json"), JSON.stringify({ url, product: data, model, usage: { modelUsd: usage.costUsd } }, null, 2));
