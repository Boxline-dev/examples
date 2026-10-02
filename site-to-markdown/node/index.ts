/**
 * Site to Markdown: crawl a site into clean Markdown files, one per page, for AI search (robots.txt is respected).
 *
 *   npx tsx node/index.ts            (BOXLINE_API_KEY; START_URL and MAX_PAGES for your own site)
 *
 * Writes output/site/<page>.md (with the page's address and title at the top) and output/site/index.json.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Boxline } from "@boxline/sdk";

const out = process.env.OUTPUT_DIR ?? "output";
const start = process.env.START_URL ?? "https://quotes.toscrape.com/";
const maxPages = Number(process.env.MAX_PAGES ?? 6);
const bx = new Boxline();

// Breadth-first from the start page, same host only, a few pages at a time; robots.txt and crawl-delay are respected.
const job = await bx.crawl.start({ url: start, maxPages, maxDepth: 2, format: "markdown" });
console.log(`Crawl ${job.id} started`);
const done = await bx.crawl.wait(job.id, { pollMs: 1500, timeoutMs: 10 * 60_000 });
console.log(`${done.status}: ${done.pagesDone} pages, ${done.pagesFailed} failed, ${done.skippedByRobots} skipped by robots.txt`);

const slug = (u: string) => {
  const { pathname, search } = new URL(u);
  return (pathname + search).replace(/^\/|\/$/g, "").replace(/[^a-zA-Z0-9]+/g, "-").slice(0, 80) || "index";
};
const dir = join(out, "site");
mkdirSync(dir, { recursive: true });
const index: { url: string; title: string; file: string; chars: number }[] = [];
for (const page of done.data) {
  if (page.error || !page.content || (page.status ?? 0) >= 400) continue;
  const file = `${slug(page.finalUrl ?? page.url)}.md`;
  writeFileSync(join(dir, file), `---\nurl: ${page.finalUrl ?? page.url}\ntitle: ${JSON.stringify(page.title ?? "")}\n---\n\n${page.content}\n`);
  index.push({ url: page.finalUrl ?? page.url, title: page.title ?? "", file, chars: page.content.length });
  console.log(`  ${file}  ${page.content.length} chars  ${page.title}`);
}
writeFileSync(join(dir, "index.json"), JSON.stringify(index, null, 2));
writeFileSync(join(out, "result.json"), JSON.stringify({ start, crawlId: job.id, status: done.status, pagesDone: done.pagesDone, skippedByRobots: done.skippedByRobots, files: index }, null, 2));
