/**
 * Prices by country: the same product page through residential proxies in three countries, side by side, with the
 * country each request really came from.
 *
 *   npx tsx node/index.ts            (BOXLINE_API_KEY; PRODUCT_URL, COUNTRIES=US,DE,GB; a plan with residential proxies)
 *
 * Proxy traffic counts against the plan's allowance. Writes output/result.json.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Boxline } from "@boxline/sdk";

const out = process.env.OUTPUT_DIR ?? "output";
const url = process.env.PRODUCT_URL ?? "https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html";
const countries = (process.env.COUNTRIES ?? "US,DE,GB").split(",").map((c) => c.trim().toUpperCase()).filter(Boolean);
const bx = new Boxline();

const rows = [];
let modelUsd = 0;
for (const country of countries) {
  const proxy = { type: "residential" as const, country };
  // Where the site sees the request from: Cloudflare's trace page names the country of the address it came from.
  const trace = await bx.fetch("https://www.cloudflare.com/cdn-cgi/trace", { format: "text", proxy });
  const seenFrom = /^loc=([A-Z]{2})$/m.exec(trace.content)?.[1] ?? null;
  // The product's price as that visitor sees it.
  const { data, usage } = await bx.extract<{ price: number; currency: string; shown: string }>({
    url,
    proxy,
    prompt: "The product's price as shown on the page.",
    schema: {
      type: "object",
      properties: { price: { type: "number" }, currency: { type: "string", description: "ISO 4217 code" }, shown: { type: "string", description: "the price exactly as the page shows it" } },
      required: ["price", "currency", "shown"],
    },
  });
  modelUsd += usage.costUsd;
  rows.push({ country, seenFrom, ...data });
  console.log(`${country}: seen from ${seenFrom}, ${data.shown} (${data.price} ${data.currency})`);
}

console.table(rows);
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "result.json"), JSON.stringify({ url, rows, usage: { modelUsd } }, null, 2));
