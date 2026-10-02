/**
 * SEO and metadata audit: titles, descriptions, headings, Open Graph and canonical tags, page by page, with a
 * suggested description (written by a model) for pages that have none.
 *
 *   npx tsx node/index.ts            (BOXLINE_API_KEY; SITE_URL for your own site, MAX_PAGES)
 *
 * Writes output/report.json: each page's tags and what to fix.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Boxline } from "@boxline/sdk";

const out = process.env.OUTPUT_DIR ?? "output";
const start = process.env.SITE_URL ?? "https://books.toscrape.com/";
const maxPages = Number(process.env.MAX_PAGES ?? 10);
const bx = new Boxline();

// Every tag with its attributes, e.g. <meta property="og:title" content="…">.
function tags(html: string, name: string): Record<string, string>[] {
  return [...html.matchAll(new RegExp(`<${name}\\b([^>]*)>`, "gi"))].map((m) =>
    Object.fromEntries([...m[1]!.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)].map((a) => [a[1]!.toLowerCase(), a[2] ?? a[3] ?? a[4] ?? ""])),
  );
}
const metaContent = (html: string, key: string) => tags(html, "meta").find((t) => t.name === key || t.property === key)?.content?.trim() ?? "";

function audit(url: string, html: string) {
  const title = (/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "").replace(/\s+/g, " ").trim();
  const page = {
    url,
    title,
    description: metaContent(html, "description"),
    h1: (html.match(/<h1\b/gi) ?? []).length,
    ogTitle: metaContent(html, "og:title"),
    ogDescription: metaContent(html, "og:description"),
    // How the page looks when shared (Open Graph image, Twitter/X card), whether it may be listed, and its language.
    ogImage: metaContent(html, "og:image"),
    twitterCard: metaContent(html, "twitter:card"),
    robots: metaContent(html, "robots"),
    lang: tags(html, "html")[0]?.lang ?? "",
    canonical: tags(html, "link").find((t) => (t.rel ?? "").split(/\s+/).includes("canonical"))?.href ?? "",
    imagesWithoutAlt: tags(html, "img").filter((t) => !("alt" in t)).length,
  };
  const fixes: string[] = [];
  if (!page.title) fixes.push("title missing");
  else if (page.title.length > 60) fixes.push(`title over 60 characters (${page.title.length})`);
  if (!page.description) fixes.push("no meta description");
  else if (page.description.length > 160) fixes.push(`meta description over 160 characters (${page.description.length})`);
  if (page.h1 !== 1) fixes.push(`${page.h1} H1 headings (want 1)`);
  if (!page.ogTitle) fixes.push("no og:title");
  if (!page.ogDescription) fixes.push("no og:description");
  if (!page.ogImage) fixes.push("no og:image (shared links show no picture)");
  if (!page.twitterCard) fixes.push("no twitter:card");
  if (/noindex/i.test(page.robots)) fixes.push("noindex: the page asks search engines not to list it");
  if (!page.lang) fixes.push("no lang attribute on <html>");
  if (!page.canonical) fixes.push("no canonical link");
  if (page.imagesWithoutAlt) fixes.push(`${page.imagesWithoutAlt} images without alt text`);
  return { ...page, fixes, suggestedDescription: null as string | null };
}

// 1. Crawl the site's pages as HTML (same host, the start page and the pages it links to).
const job = await bx.crawl.start({ url: start, maxPages, maxDepth: 1, format: "html" });
const crawl = await bx.crawl.wait(job.id, { pollMs: 1500, timeoutMs: 10 * 60_000 });
const report = crawl.data.filter((p) => p.content && (p.status ?? 0) < 400).map((p) => audit(p.finalUrl ?? p.url, p.content!));

// 2. A model suggests a description for up to 3 pages that have none.
let modelUsd = 0;
for (const page of report.filter((p) => !p.description).slice(0, 3)) {
  const r = await bx.extract<{ description: string }>({
    url: page.url,
    prompt: "Write a meta description for this page: one plain, specific sentence of at most 155 characters.",
    schema: { type: "object", properties: { description: { type: "string" } }, required: ["description"] },
  });
  page.suggestedDescription = r.data.description;
  modelUsd += r.usage.costUsd;
}

for (const p of report) {
  console.log(`${p.url}\n  ${p.fixes.length ? p.fixes.join("; ") : "nothing to fix"}${p.suggestedDescription ? `\n  suggested description: ${p.suggestedDescription}` : ""}`);
}
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "report.json"), JSON.stringify(report, null, 2));
writeFileSync(join(out, "result.json"), JSON.stringify({ start, pages: report.length, report, usage: { modelUsd } }, null, 2));
