/**
 * Playwright with Boxline: connect Playwright to a Boxline session's browser over CDP and use it as usual (locators,
 * routes, screenshots). No AI, no model cost.
 *
 *   npm install && npx tsx index.ts        (BOXLINE_API_KEY in the environment)
 *
 * Writes output/result.json and output/page.png.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Boxline } from "@boxline/sdk";
import { chromium } from "playwright-core";

const out = process.env.OUTPUT_DIR ?? "output";
const bx = new Boxline();

const session = await bx.sessions.create({ timeout: 300, userMetadata: { example: "integrations/playwright" } });
console.log(`Session: ${session.id}`);
// connectUrl is a signed WebSocket address: treat it like a password.
const browser = await chromium.connectOverCDP(session.connectUrl!);
try {
  // The session's browser has one context with one page; use them, or open more with context.newPage().
  const context = browser.contexts()[0]!;
  const page = context.pages()[0] ?? (await context.newPage());

  // Routes run in Playwright on this computer: every request the page makes passes through here (block, change or
  // answer it); this one counts them by type and lets them through.
  const requests: Record<string, number> = {};
  await context.route("**/*", (route) => {
    const type = route.request().resourceType();
    requests[type] = (requests[type] ?? 0) + 1;
    return route.continue();
  });

  await page.goto("https://quotes.toscrape.com/");
  const quotes = page.locator(".quote");
  const first = await quotes.evaluateAll((els) =>
    els.slice(0, 3).map((el) => ({ text: el.querySelector(".text")!.textContent!.trim(), author: el.querySelector(".author")!.textContent!.trim() })),
  );
  await page.getByRole("link", { name: /Next/ }).click();
  await page.waitForURL(/\/page\/2\/$/);
  const page2Author = (await quotes.first().locator(".author").textContent())?.trim();

  mkdirSync(out, { recursive: true });
  const png = await page.screenshot({ path: join(out, "page.png") });
  for (const q of first) console.log(`${q.author}: ${q.text.slice(0, 70)}`);
  console.log(`Page 2 starts with ${page2Author}; requests seen: ${JSON.stringify(requests)}; screenshot ${png.length} bytes`);
  writeFileSync(join(out, "result.json"), JSON.stringify({ sessionId: session.id, quotes: first, page2Url: page.url(), page2Author, requests, screenshotBytes: png.length }, null, 2));
} finally {
  await session.stop();
  await browser.close().catch(() => undefined);
}
