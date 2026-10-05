/**
 * Puppeteer with Boxline: connect Puppeteer to a Boxline session's browser with its CDP address and use it as usual.
 * puppeteer-core is enough: nothing is downloaded or launched on this computer. No AI, no model cost.
 *
 *   npm install && npx tsx index.ts        (BOXLINE_API_KEY in the environment)
 *
 * Writes output/result.json and output/poetry.png.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Boxline } from "@boxline/sdk";
import puppeteer from "puppeteer-core";

const out = process.env.OUTPUT_DIR ?? "output";
const bx = new Boxline();

const session = await bx.sessions.create({ timeout: 300, userMetadata: { example: "integrations/puppeteer" } });
console.log(`Session: ${session.id}`);
// connectUrl is a signed WebSocket address: treat it like a password. defaultViewport null keeps the session's own.
const browser = await puppeteer.connect({ browserWSEndpoint: session.connectUrl!, defaultViewport: null });
try {
  const [page] = await browser.pages();
  await page!.goto("https://books.toscrape.com/", { waitUntil: "domcontentloaded" });
  await Promise.all([page!.waitForNavigation({ waitUntil: "domcontentloaded" }), page!.click('a[href*="category/books/poetry_23"]')]);
  const heading = await page!.$eval(".page-header h1", (h) => h.textContent!.trim());
  const books = await page!.$$eval("article.product_pod", (items) =>
    items.map((item) => ({ title: item.querySelector("h3 a")!.getAttribute("title")!, price: item.querySelector(".price_color")!.textContent!.trim() })),
  );
  mkdirSync(out, { recursive: true });
  const png = await page!.screenshot({ path: join(out, "poetry.png") as `${string}.png` });
  console.log(`${heading}: ${books.length} books, e.g. ${books[0]?.title} ${books[0]?.price}`);
  writeFileSync(join(out, "result.json"), JSON.stringify({ sessionId: session.id, url: page!.url(), heading, books, screenshotBytes: png.length }, null, 2));
} finally {
  await session.stop(); // saves the session and ends its billing; the connection closes with it
  await browser.disconnect().catch(() => undefined);
}
