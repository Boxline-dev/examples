/**
 * Link checker: crawl the pages a page links to and report the broken ones and the slow ones.
 *
 *   npx tsx node/index.ts            (BOXLINE_API_KEY; SITE_URL for your own page, MAX_PAGES, SLOW_MS)
 *
 * Writes output/result.json: every page checked, the broken ones (HTTP 400+ or not loading) and the slow ones.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Boxline, BoxlineError } from "@boxline/sdk";

const out = process.env.OUTPUT_DIR ?? "output";
const start = process.env.SITE_URL ?? "https://books.toscrape.com/";
const maxPages = Number(process.env.MAX_PAGES ?? 20);
const slowMs = Number(process.env.SLOW_MS ?? 2000);
const maxExternal = Number(process.env.MAX_EXTERNAL ?? 15);
const bx = new Boxline();

// 1. Crawl the page and the pages it links to on the same site (depth 1): each one's HTTP status, or why it failed.
const job = await bx.crawl.start({ url: start, maxPages, maxDepth: 1, format: "text" });
const crawl = await bx.crawl.wait(job.id, { pollMs: 1500, timeoutMs: 10 * 60_000 });
console.log(`Crawled ${crawl.data.length} pages from ${start}`);

const broken: { url: string; status: number | null; error: string | null }[] = [];
const timed: { url: string; status: number | null; ms: number }[] = [];
for (const page of crawl.data) {
  if (page.error || (page.status ?? 0) >= 400) {
    broken.push({ url: page.url, status: page.status, error: page.error });
    continue;
  }
  // 2. Time each page that loaded, one at a time to be polite to the site (fetch reports how long the page took).
  try {
    const r = await bx.fetch(page.url, { format: "text", timeoutMs: 30_000 });
    timed.push({ url: page.url, status: r.status, ms: r.ms });
  } catch (err) {
    broken.push({ url: page.url, status: null, error: err instanceof BoxlineError ? err.code : String(err) });
  }
}
const slow = timed.filter((t) => t.ms > slowMs).sort((a, b) => b.ms - a.ms);

// 3. Links to other sites from the start page, opened in a sandboxed browser three at a time. "Blocked" is a site that
//    refuses automated visitors (401, 403, 429 or a CAPTCHA): the link may well work for people, so check it by hand.
const home = await bx.fetch(start, { format: "text", links: true });
const host = new URL(home.finalUrl).host;
const outbound = [...new Set((home.links ?? []).filter((l) => new URL(l).host !== host).map((l) => l.replace(/#.*$/, "")))].slice(0, maxExternal);
const external: { url: string; verdict: "working" | "broken" | "blocked"; status: number | null; why: string }[] = [];
for (let i = 0; i < outbound.length; i += 3) {
  external.push(
    ...(await Promise.all(
      outbound.slice(i, i + 3).map(async (url) => {
        try {
          const p = await bx.fetch(url, { format: "text", timeoutMs: 30_000 });
          const status = p.status;
          if (p.captcha || [401, 403, 429].includes(status ?? 0)) return { url, verdict: "blocked" as const, status, why: p.captcha ? `a ${p.captcha} CAPTCHA` : `HTTP ${status}` };
          if ((status ?? 0) >= 400) return { url, verdict: "broken" as const, status, why: `HTTP ${status}` };
          return { url, verdict: "working" as const, status, why: `HTTP ${status}` };
        } catch (err) {
          return { url, verdict: "broken" as const, status: null, why: err instanceof BoxlineError ? err.message : String(err) };
        }
      }),
    )),
  );
}

for (const b of broken) console.log(`BROKEN  ${b.status ?? b.error}  ${b.url}`);
for (const s of slow) console.log(`SLOW    ${(s.ms / 1000).toFixed(1)} s  ${s.url}`);
for (const e of external.filter((x) => x.verdict !== "working")) console.log(`${e.verdict.toUpperCase().padEnd(7)} ${e.why}  ${e.url}`);
console.log(`${crawl.data.length} checked: ${broken.length} broken, ${slow.length} slower than ${slowMs / 1000} s`);
console.log(`${external.length} links to other sites: ${external.filter((x) => x.verdict === "working").length} working, ${external.filter((x) => x.verdict === "broken").length} broken, ${external.filter((x) => x.verdict === "blocked").length} blocked`);

mkdirSync(out, { recursive: true });
writeFileSync(join(out, "result.json"), JSON.stringify({ start, slowMs, checked: crawl.data.length, broken, slow, pages: timed, external }, null, 2));
