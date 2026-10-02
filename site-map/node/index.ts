/**
 * Site map: crawl a site and draw its page tree, list its heaviest pages and broken links, and find its orphans: pages
 * the site's sitemap.xml lists but no crawled page links to (a crawler alone can never find those).
 *
 *   npx tsx node/index.ts            (BOXLINE_API_KEY; SITE_URL, MAX_PAGES, MAX_DEPTH; SITEMAP_URL to override)
 *
 * The crawl respects robots.txt and crawl-delay. Writes output/result.json and output/sitemap.md.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Boxline } from "@boxline/sdk";

const out = process.env.OUTPUT_DIR ?? "output";
const start = process.env.SITE_URL ?? "https://quotes.toscrape.com/";
const sitemapUrl = process.env.SITEMAP_URL ?? new URL("/sitemap.xml", start).href;
const maxPages = Number(process.env.MAX_PAGES ?? 30);
const maxDepth = Number(process.env.MAX_DEPTH ?? 3);
const bx = new Boxline();

const path = (u: string) => {
  const x = new URL(u);
  return (x.pathname.replace(/\/index\.html?$/, "/") || "/") + x.search;
};

// 1. Crawl as HTML, so each page's links can be read (same host, breadth-first).
const job = await bx.crawl.start({ url: start, maxPages, maxDepth, format: "html" });
console.log(`Crawling ${start} (up to ${maxPages} pages, depth ${maxDepth}): ${job.id}`);
const done = await bx.crawl.wait(job.id, { pollMs: 1500, timeoutMs: 10 * 60_000 });
const crawled = done.data; // every page, in crawl order
console.log(`${done.status}: ${done.pagesDone} pages, ${done.pagesFailed} failed, ${done.skippedByRobots} skipped by robots.txt`);

// 2. Links, sizes and the tree (each page under the first page that linked to it).
const host = new URL(start).host;
const pages = new Map<string, { title: string | null; status: number | null; bytes: number; depth: number; links: Set<string> }>();
for (const p of crawled) {
  const at = p.finalUrl ?? p.url;
  const links = new Set<string>();
  for (const m of (p.content ?? "").matchAll(/<a\s[^>]*href\s*=\s*["']([^"'#]+)["']/gi)) {
    try {
      const u = new URL(m[1]!, at);
      if (/^https?:$/.test(u.protocol) && u.host === host) links.add(path(u.href));
    } catch {
      /* not an address */
    }
  }
  pages.set(path(at), { title: p.title, status: p.status, bytes: Buffer.byteLength(p.content ?? ""), depth: p.depth, links });
}
const parent = new Map<string, string>();
const order = [...pages.entries()].sort((a, b) => a[1].depth - b[1].depth);
for (const [from, meta] of order) for (const to of meta.links) if (pages.has(to) && to !== from && !parent.has(to) && to !== path(start)) parent.set(to, from);
const tree: string[] = [];
const draw = (p: string, indent: string) => {
  const m = pages.get(p)!;
  tree.push(`${indent}${p}  ${m.title ?? ""}${m.status && m.status >= 400 ? `  [${m.status}]` : ""}`);
  for (const [child, from] of parent) if (from === p) draw(child, `${indent}  `);
};
draw(path(start), "");

// 3. Orphans: in the sitemap, never linked from a crawled page. Broken: linked, and answered 400 or more.
let listed: string[] = [];
try {
  const res = await fetch(sitemapUrl);
  if (res.ok) listed = [...(await res.text()).matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => path(m[1]!));
} catch {
  /* no sitemap: no orphans can be found */
}
const linked = new Set([...pages.values()].flatMap((m) => [...m.links]));
const orphans = listed.filter((p) => !linked.has(p) && p !== path(start));
const broken = [...pages.entries()].filter(([, m]) => m.status !== null && m.status >= 400).map(([p, m]) => ({ path: p, status: m.status, linkedFrom: [...pages.entries()].filter(([, x]) => x.links.has(p)).map(([q]) => q) }));
const heaviest = [...pages.entries()].sort((a, b) => b[1].bytes - a[1].bytes).slice(0, 10).map(([p, m]) => ({ path: p, kb: Math.round(m.bytes / 102.4) / 10 }));

console.log(`\n${tree.join("\n")}`);
console.log(`\nOrphans (in ${listed.length ? "the sitemap" : "no sitemap"}, never linked): ${orphans.join(", ") || "none"}`);
console.log(`Broken links: ${broken.map((b) => `${b.path} (${b.status}, from ${b.linkedFrom.join(", ")})`).join("; ") || "none"}`);
console.log(`Heaviest: ${heaviest.slice(0, 5).map((h) => `${h.path} ${h.kb} KB`).join(", ")}`);

const md = [
  `# ${start}`,
  "",
  `${pages.size} pages crawled (depth ${maxDepth}); sitemap: ${listed.length ? `${listed.length} addresses` : "none found"}.`,
  "",
  "## Pages",
  "",
  "```",
  ...tree,
  "```",
  "",
  `## Orphans\n\n${orphans.map((o) => `- ${o}`).join("\n") || "None."}`,
  "",
  `## Broken links\n\n${broken.map((b) => `- ${b.path} (${b.status}), linked from ${b.linkedFrom.join(", ")}`).join("\n") || "None."}`,
  "",
  `## Heaviest pages\n\n${heaviest.map((h) => `- ${h.path}: ${h.kb} KB`).join("\n")}`,
  "",
].join("\n");
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "sitemap.md"), md);
writeFileSync(
  join(out, "result.json"),
  JSON.stringify({ start, crawlId: job.id, status: done.status, pages: [...pages.entries()].map(([p, m]) => ({ path: p, title: m.title, status: m.status, kb: Math.round(m.bytes / 102.4) / 10, depth: m.depth, parent: parent.get(p) ?? null, links: [...m.links] })), sitemap: listed, orphans, broken, heaviest }, null, 2),
);
