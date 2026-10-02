/**
 * Site to RAG chunks: crawl a site (or one page) and turn it into chunks ready for an embedding pipeline: boilerplate
 * found across pages (navigation, footers, cookie notes: lines most pages repeat) removed, each page cut at its
 * headings, then into chunks within a token budget, each with its heading path and a ready-to-embed text.
 *
 *   npx tsx node/index.ts            (BOXLINE_API_KEY; SITE_URL, MAX_PAGES, MAX_TOKENS)
 *
 * No model is used. The crawl respects robots.txt. Writes output/chunks.jsonl and output/result.json.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Boxline } from "@boxline/sdk";

const out = process.env.OUTPUT_DIR ?? "output";
const start = process.env.SITE_URL ?? "https://playwright.dev/docs/intro";
const maxPages = Number(process.env.MAX_PAGES ?? 10);
const maxTokens = Number(process.env.MAX_TOKENS ?? 300);
const bx = new Boxline();

const tokens = (s: string) => Math.ceil(s.length / 4); // a rough count (about 4 characters per token in English)
const isHeading = (line: string) => /^#{1,6}\s/.test(line);
/** Navigation, not content: a block of 3 or more links where links make up 70% or more of the visible text. */
const isLinkList = (block: string) => {
  const links = [...block.matchAll(/!?\[([^\]]*)\]\([^)]*\)/g)];
  if (links.length < 3) return false;
  const visible = block.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[*_#>`|-]/g, "").replace(/\s+/g, "").length;
  const linked = links.reduce((n, m) => n + m[1]!.replace(/\s+/g, "").length, 0);
  return visible === 0 || linked / visible >= 0.7;
};

// 1. The pages, as Markdown (same host, breadth-first).
const job = await bx.crawl.start({ url: start, maxPages, maxDepth: 2, format: "markdown" });
const done = await bx.crawl.wait(job.id, { pollMs: 1500, timeoutMs: 10 * 60_000 });
const pages = done.data.filter((p) => p.content && !p.error && (p.status ?? 0) < 400);
console.log(`Crawled ${start}: ${pages.length} pages to chunk (${done.pagesFailed} failed, ${done.skippedByRobots} skipped by robots.txt)`);

// 2. Boilerplate: a line (not a heading) that most pages repeat.
const seenOn = new Map<string, number>();
for (const p of pages) for (const line of new Set(p.content!.split("\n").map((l) => l.trim()).filter((l) => l.length > 3 && !isHeading(l)))) seenOn.set(line, (seenOn.get(line) ?? 0) + 1);
const boilerplate = new Set(pages.length >= 3 ? [...seenOn].filter(([, n]) => n >= Math.max(2, Math.ceil(pages.length * 0.6))).map(([l]) => l) : []);
console.log(`${boilerplate.size} boilerplate lines removed${boilerplate.size ? `, e.g. "${[...boilerplate][0]!.slice(0, 60)}"` : ""}`);

// 3. Sections at headings, then chunks within the budget (paragraphs kept whole when they fit, else cut at sentences).
type Chunk = { id: string; url: string; title: string; headings: string[]; text: string; tokens: number; embedText: string };
const chunks: Chunk[] = [];
for (const p of pages) {
  const url = p.finalUrl ?? p.url;
  const title = p.title ?? url;
  const slug = new URL(url).pathname.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "index";
  const stack: string[] = [];
  let paragraphs: string[] = [];
  let n = 0;
  const flush = () => {
    let buf: string[] = [];
    const emit = () => {
      const text = buf.join("\n\n").trim();
      if (!text) return;
      const headings = [...stack];
      chunks.push({ id: `${slug}-${++n}`, url, title, headings, text, tokens: tokens(text), embedText: `${[title, ...headings].join(" > ")}\n\n${text}` });
      buf = [];
    };
    for (const para of paragraphs) {
      const pieces = tokens(para) <= maxTokens ? [para] : (para.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) ?? [para]).map((s) => s.trim());
      for (const piece of pieces) {
        if (tokens([...buf, piece].join("\n\n")) > maxTokens) emit();
        buf.push(piece.length / 4 > maxTokens ? piece.slice(0, maxTokens * 4) : piece);
      }
    }
    emit();
    paragraphs = [];
  };
  // The page starts at its title when it has one (what comes before is the site's header and breadcrumbs).
  const blocks = p.content!.split(/\n\s*\n/);
  const titleAt = blocks.findIndex((b) => /^#\s/.test(b.trim()));
  for (const block of titleAt > 0 ? blocks.slice(titleAt) : blocks) {
    const lines = block.split("\n").filter((l) => !boilerplate.has(l.trim()));
    if (!lines.join("").trim() || isLinkList(lines.join("\n"))) continue;
    if (isHeading(lines[0]!.trim())) {
      flush();
      const level = lines[0]!.trim().match(/^#+/)![0].length;
      stack.splice(level - 1);
      stack[level - 1] = lines[0]!.trim().replace(/^#+\s*/, "");
      for (let i = 0; i < stack.length; i++) stack[i] ??= ""; // a skipped level stays empty, then is left out
      const rest = lines.slice(1).join("\n").trim();
      if (rest) paragraphs.push(rest);
    } else paragraphs.push(lines.join("\n").trim());
  }
  flush();
}
for (const c of chunks) c.headings = c.headings.filter(Boolean);

const largest = Math.max(0, ...chunks.map((c) => c.tokens));
console.log(`${chunks.length} chunks of at most ${maxTokens} tokens (largest ${largest}) from ${pages.length} pages`);
for (const c of chunks.slice(0, 3)) console.log(`  ${c.id}  [${c.headings.join(" > ")}]  ${c.text.slice(0, 80).replace(/\n/g, " ")}…`);
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "chunks.jsonl"), chunks.map((c) => JSON.stringify(c)).join("\n") + "\n");
writeFileSync(join(out, "result.json"), JSON.stringify({ start, crawlId: job.id, pages: pages.map((p) => p.finalUrl ?? p.url), maxTokens, chunks: chunks.length, largest, boilerplate: [...boilerplate] }, null, 2));
