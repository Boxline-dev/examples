/**
 * Get a page, or a browser? The same site two ways: fetch (one call, the page as Markdown: for reading) and a session
 * (a browser that stays open between calls: for clicking through pages, forms and sign-ins).
 *
 *   npx tsx node/index.ts            (BOXLINE_API_KEY in the environment; PAGE_URL for another site)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Boxline } from "@boxline/sdk";

const out = process.env.OUTPUT_DIR ?? "output";
const url = process.env.PAGE_URL ?? "https://quotes.toscrape.com/";
const bx = new Boxline();

// 1. fetch: the page is rendered in a real browser inside a sandbox and comes back as Markdown, with its links.
let t0 = Date.now();
const page = await bx.fetch(url, { format: "markdown", links: true });
const fetched = { title: page.title, status: page.status, chars: page.content.length, links: page.links?.length ?? 0, ms: Date.now() - t0 };
console.log(`fetch: "${page.title}" (HTTP ${page.status}), ${fetched.chars} characters of Markdown and ${fetched.links} links in ${fetched.ms} ms`);

// 2. A session: the browser keeps its page, cookies and history between calls, so it can click on to page 3.
const session = await bx.sessions.create({ timeout: 300, userMetadata: { example: "fetch-or-browser" } });
console.log(`Session: ${session.id}`);
try {
  t0 = Date.now();
  await session.goto(url);
  const pages: { url: string; authors: string[] }[] = [];
  for (let i = 0; i < 2; i++) {
    const results = await session.actions([
      { action: "click", selector: "li.next a" },
      { action: "wait", selector: ".quote" },
      { action: "evaluate", expression: "({ url: location.href, authors: [...document.querySelectorAll('.quote .author')].map((a) => a.textContent) })" },
    ]);
    const read = results.at(-1)!.value as { url: string; authors: string[] };
    console.log(`session: ${read.url}: ${read.authors.length} quotes, the first by ${read.authors[0]}`);
    pages.push(read);
  }
  const browsed = { ms: Date.now() - t0, pages };

  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "result.json"), JSON.stringify({ url, fetch: { ...fetched, hasEinstein: page.content.includes("Albert Einstein") }, session: browsed }, null, 2));
  console.log("Use fetch to read a page; use a session when you need to act on it (click, type, sign in, download).");
} finally {
  await session.release();
}
