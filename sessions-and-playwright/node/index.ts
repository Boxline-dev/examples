/**
 * Sessions and Playwright: start a session, connect Playwright to its browser, read a page, release the session.
 *
 *   npx tsx node/index.ts            (BOXLINE_API_KEY in the environment)
 *
 * Writes output/result.json: the page title and the first 5 books with their prices.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Boxline } from "@boxline/sdk";
import { chromium } from "playwright-core";

const out = process.env.OUTPUT_DIR ?? "output";
const bx = new Boxline(); // reads BOXLINE_API_KEY, and BOXLINE_API_URL for another API

const session = await bx.sessions.create({ timeout: 300, userMetadata: { example: "sessions-and-playwright" } });
console.log(`Session: ${session.id}`);
const browser = await chromium.connectOverCDP(session.connectUrl!); // a signed URL: treat it like a password
try {
  const page = browser.contexts()[0]!.pages()[0]!;
  await page.goto("https://books.toscrape.com/");
  const title = await page.title();
  const books = await page.$$eval("article.product_pod", (items) =>
    items.slice(0, 5).map((item) => ({
      title: item.querySelector("h3 a")?.getAttribute("title") ?? "",
      price: item.querySelector(".price_color")?.textContent?.trim() ?? "",
    })),
  );
  console.table(books);

  // The actions API drives the same browser without Playwright: one HTTP call, here for the page as text.
  const { title: actionsTitle, content } = await session.content("text");
  console.log(`The actions API sees "${actionsTitle}" (${content.length} characters of text)`);

  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "result.json"), JSON.stringify({ sessionId: session.id, title, books, actionsTitle }, null, 2));
} finally {
  await session.release(); // ends the session and its billing
  await browser.close().catch(() => undefined);
}
