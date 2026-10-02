/**
 * Product alternatives: read a product page, find comparable products (from a web search, or the candidate pages you
 * give), rank them by how close they are with a reason each, and show the price difference. Prices are remembered,
 * so the next run says which went up or down.
 *
 *   npx tsx node/index.ts            (BOXLINE_API_KEY; PRODUCT_URL; CANDIDATES comma-separated, else a search)
 *
 * Writes output/result.json and output/alternatives.md.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Boxline } from "@boxline/sdk";

const out = process.env.OUTPUT_DIR ?? "output";
const stateDir = process.env.STATE_DIR ?? join(out, "state");
const productUrl = process.env.PRODUCT_URL ?? "https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html";
const given = (process.env.CANDIDATES ?? "").split(",").map((u) => u.trim()).filter(Boolean);
const bx = new Boxline();

type Product = { url: string; name: string; price: number | null; currency: string | null; category: string | null; features: string[] };
const PRODUCT = {
  type: "object",
  properties: {
    url: { type: "string" },
    name: { type: "string" },
    price: { type: ["number", "null"], description: "a number without the currency sign" },
    currency: { type: ["string", "null"], description: "ISO 4217" },
    category: { type: ["string", "null"] },
    features: { type: "array", items: { type: "string" }, description: "what it is and does, in a few words each" },
  },
  required: ["url", "name", "price", "currency", "category", "features"],
};

// 1. The product itself.
const base = await bx.extract<Product>({ url: productUrl, prompt: "The product on this page. url: the page's address as given.", schema: PRODUCT });
let modelUsd = base.usage.costUsd;
const product = { ...base.data, url: productUrl };
console.log(`${product.name}: ${product.price ?? "?"} ${product.currency ?? ""} (${product.category ?? "no category"})`);

// 2. Candidates: the pages given, or product pages a search finds (not this one).
let searches = 0;
let candidates = given;
if (!candidates.length) {
  const found = await bx.search({ query: `${product.name} alternatives similar ${product.category ?? ""}`.trim(), limit: 10 });
  searches = found.cached ? 0 : 1;
  candidates = found.results.map((r) => r.url).filter((u) => u !== productUrl).slice(0, 6);
}
const r = await bx.extract<{ items: (Product & { similarity: number; why: string })[] }>({
  urls: candidates.slice(0, 10),
  prompt:
    `Each page may sell a product. For each page, the product on it, and how close it is to this one: "${product.name}" (${product.category ?? "?"}; ${product.features.join(", ")}). ` +
    `similarity: 0 (nothing alike) to 1 (the same kind of thing for the same buyer); why: one sentence. Pages that sell no product get similarity 0. url: the page's address as given.`,
  schema: { type: "object", properties: { items: { type: "array", items: { ...PRODUCT, properties: { ...PRODUCT.properties, similarity: { type: "number" }, why: { type: "string" } }, required: [...PRODUCT.required, "similarity", "why"] } } }, required: ["items"] },
});
modelUsd += r.usage.costUsd;

// 3. Ranked, with the price difference, and the change since the last run.
mkdirSync(stateDir, { recursive: true });
const stateFile = join(stateDir, `${createHash("sha256").update(productUrl).digest("hex").slice(0, 16)}.json`);
const before: Record<string, number | null> = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, "utf8")) : {};
const ranked = r.data.items
  .map((it, i) => ({ ...it, url: candidates.find((c) => c === it.url) ?? candidates[i] ?? it.url }))
  .filter((it) => it.similarity > 0)
  .sort((a, b) => b.similarity - a.similarity)
  .map((it) => ({
    ...it,
    priceDiff: it.price !== null && product.price !== null && it.currency === product.currency ? Math.round((it.price - product.price) * 100) / 100 : null,
    priceChange: before[it.url] !== undefined && before[it.url] !== it.price ? { from: before[it.url], to: it.price } : null,
  }));
writeFileSync(stateFile, JSON.stringify(Object.fromEntries([[productUrl, product.price], ...ranked.map((x) => [x.url, x.price])])));

for (const x of ranked) {
  const diff = x.priceDiff === null ? "" : x.priceDiff === 0 ? ", same price" : `, ${x.priceDiff > 0 ? "+" : ""}${x.priceDiff} ${x.currency}`;
  console.log(`  ${x.similarity.toFixed(2)}  ${x.name}: ${x.price ?? "?"} ${x.currency ?? ""}${diff}${x.priceChange ? ` (was ${x.priceChange.from})` : ""}\n        ${x.why}`);
}
const md = [
  `# Alternatives to ${product.name}`,
  "",
  `[${product.name}](${productUrl}): ${product.price ?? "?"} ${product.currency ?? ""}`,
  "",
  "| | Product | Price | Difference | Why |",
  "|---|---|---|---|---|",
  ...ranked.map((x) => `| ${x.similarity.toFixed(2)} | [${x.name}](${x.url}) | ${x.price ?? "?"} ${x.currency ?? ""} | ${x.priceDiff ?? ""} | ${x.why} |`),
  "",
].join("\n");
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "alternatives.md"), md);
writeFileSync(join(out, "result.json"), JSON.stringify({ product, candidates, alternatives: ranked, usage: { modelUsd, searches } }, null, 2));
