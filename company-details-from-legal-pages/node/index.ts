/**
 * Company details from its legal pages: crawl a site's pages, pick its terms, privacy and imprint pages, and have a
 * model read the organisation's legal name and postal address from them.
 *
 *   npx tsx node/index.ts            (BOXLINE_API_KEY; SITE_URL for another site)
 *
 * Writes output/company.json.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Boxline } from "@boxline/sdk";

const out = process.env.OUTPUT_DIR ?? "output";
const site = process.env.SITE_URL ?? "https://www.eff.org/";
const bx = new Boxline();

// 1. The start page and the pages it links to (same site, robots.txt respected).
const job = await bx.crawl.start({ url: site, maxPages: 40, maxDepth: 1, format: "text" });
const crawl = await bx.crawl.wait(job.id, { pollMs: 1500, timeoutMs: 10 * 60_000 });
const LEGAL = /terms|privacy|legal|imprint|impressum|about|contact|policy/i;
const legal = crawl.data
  .filter((p) => !p.error && (p.status ?? 0) < 400 && (LEGAL.test(new URL(p.url).pathname) || LEGAL.test(p.title ?? "")))
  .sort((a, b) => Number(/privacy|imprint|impressum|legal/i.test(b.url)) - Number(/privacy|imprint|impressum|legal/i.test(a.url)))
  .slice(0, 4);
console.log(`${crawl.data.length} pages crawled; reading ${legal.length}: ${legal.map((p) => new URL(p.url).pathname).join(", ")}`);
if (!legal.length) throw new Error("no terms, privacy or imprint page is linked from the start page");

// 2. A model reads them into a fixed shape (the pages render in a real browser; their text is treated as data).
const { data, usage } = await bx.extract<{ legalName: string; address: string; foundOn: string }>({
  urls: legal.map((p) => p.finalUrl ?? p.url),
  prompt: "The legal name and postal address of the organisation that runs this website, and the address (URL) of the page that says so.",
  schema: {
    type: "object",
    properties: { legalName: { type: "string" }, address: { type: "string", description: "the postal address on one line" }, foundOn: { type: "string" } },
    required: ["legalName", "address", "foundOn"],
  },
});
console.log(`${data.legalName}, ${data.address} (from ${data.foundOn})`);
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "company.json"), JSON.stringify(data, null, 2));
writeFileSync(join(out, "result.json"), JSON.stringify({ site, read: legal.map((p) => p.finalUrl ?? p.url), company: data, usage: { modelUsd: usage.costUsd } }, null, 2));
