/**
 * Crawl and extract: find every page of one kind on a site (the crawl follows only links that match a pattern), then
 * pull the same fields from each with one schema, 10 pages per extract call, into JSONL and CSV. Each price is then
 * checked against the crawled page's own text, so a model slip shows up as "not verified".
 *
 *   npx tsx node/index.ts            (BOXLINE_API_KEY; START_URL, INCLUDE, MAX_PAGES)
 *
 * The default: every book in a books.toscrape.com category (a demo shop). The crawl respects robots.txt.
 * Writes output/items.jsonl, output/items.csv and output/result.json.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Boxline } from "@boxline/sdk";

const out = process.env.OUTPUT_DIR ?? "output";
const start = process.env.START_URL ?? "https://books.toscrape.com/catalogue/category/books/poetry_23/index.html";
const include = process.env.INCLUDE ?? "/catalogue/[^/]+_\\d+/index\\.html$"; // product pages, not categories
const maxPages = Number(process.env.MAX_PAGES ?? 40);
const bx = new Boxline();

type Item = { url: string; title: string; price: number; currency: string; rating: number | null; inStock: boolean; stockCount: number | null };

// 1. Discover: the start page, then only links that match the pattern (one level deep).
const job = await bx.crawl.start({ url: start, maxPages, maxDepth: 1, include: [include], format: "markdown" });
const done = await bx.crawl.wait(job.id, { pollMs: 1500, timeoutMs: 10 * 60_000 });
const pattern = new RegExp(include);
const found = done.data.filter((p) => pattern.test(p.finalUrl ?? p.url) && !p.error && (p.status ?? 0) < 400);
console.log(`Crawled ${done.pagesDone} pages from ${start}; ${found.length} match ${include}`);
if (!found.length) throw new Error("no page matched INCLUDE; check the pattern against the site's addresses");

// 2. Extract: the same schema for every page, 10 pages per call (each page's row says which page it is).
const items: (Item & { verified: boolean })[] = [];
let modelUsd = 0;
for (let i = 0; i < found.length; i += 10) {
  const batch = found.slice(i, i + 10);
  const r = await bx.extract<{ items: Item[] }>({
    urls: batch.map((p) => p.finalUrl ?? p.url),
    prompt: "One row per page: the product on it. url: the page's address as given. price: a number without the currency sign; currency: ISO 4217. rating: 1 to 5 stars, null when none. stockCount: the number available when the page says.",
    schema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              url: { type: "string" },
              title: { type: "string" },
              price: { type: "number" },
              currency: { type: "string" },
              rating: { type: ["integer", "null"] },
              inStock: { type: "boolean" },
              stockCount: { type: ["integer", "null"] },
            },
            required: ["url", "title", "price", "currency", "rating", "inStock", "stockCount"],
          },
        },
      },
      required: ["items"],
    },
  });
  modelUsd += r.usage.costUsd;
  // 3. Verify: the price must be written on that page (as crawled), with two decimals.
  for (const it of r.data.items) {
    const page = batch.find((p) => (p.finalUrl ?? p.url) === it.url || p.url === it.url);
    items.push({ ...it, verified: Boolean(page?.content?.includes(it.price.toFixed(2))) });
  }
  console.log(`  pages ${i + 1}–${i + batch.length}: ${r.data.items.length} rows ($${r.usage.costUsd.toFixed(4)})`);
}

const unverified = items.filter((x) => !x.verified);
console.log(`${items.length} rows, ${items.length - unverified.length} prices verified against the page${unverified.length ? `; check: ${unverified.map((x) => x.title).join(", ")}` : ""}`);
for (const x of items.slice(0, 5)) console.log(`  ${x.title}: ${x.price} ${x.currency}, ${x.rating ?? "?"}★, ${x.inStock ? `in stock (${x.stockCount ?? "?"})` : "out of stock"}`);

const cols = ["title", "price", "currency", "rating", "inStock", "stockCount", "verified", "url"] as const;
const cell = (v: unknown) => (v === null || v === undefined ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "items.jsonl"), items.map((x) => JSON.stringify(x)).join("\n") + "\n");
writeFileSync(join(out, "items.csv"), [cols.join(","), ...items.map((x) => cols.map((c) => cell(x[c])).join(","))].join("\n") + "\n");
writeFileSync(join(out, "result.json"), JSON.stringify({ start, include, crawlId: job.id, crawled: done.pagesDone, matched: found.map((p) => p.finalUrl ?? p.url), rows: items.length, verified: items.length - unverified.length, unverified: unverified.map((x) => x.url), usage: { modelUsd } }, null, 2));
