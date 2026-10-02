/**
 * News to drafts: find what is new on the blogs or news pages you follow since the last run, read the new posts, and
 * write drafts for a person to review: a newsletter (Markdown and HTML) and one short social post per item, each with
 * its source link. Nothing is sent or posted.
 *
 *   npx tsx node/index.ts            (BOXLINE_API_KEY; SOURCES comma-separated index pages; RUNS, INTERVAL_SECONDS)
 *
 * The posts already seen are kept in STATE_DIR. Writes output/newsletter.md, output/newsletter.html, output/posts.json
 * and output/result.json (the latest round's drafts).
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Boxline } from "@boxline/sdk";

const out = process.env.OUTPUT_DIR ?? "output";
const stateDir = process.env.STATE_DIR ?? join(out, "state");
const sources = (process.env.SOURCES ?? "https://github.blog/changelog/").split(",").map((u) => u.trim()).filter(Boolean).slice(0, 10);
const runs = Number(process.env.RUNS ?? 1);
const interval = Number(process.env.INTERVAL_SECONDS ?? 3600);
const maxItems = Number(process.env.MAX_ITEMS ?? 8);
const bx = new Boxline();

type Item = { url: string; title: string; summary: string; takeaway: string; post: string };
const seenFile = join(stateDir, `seen-${createHash("sha256").update(sources.join(",")).digest("hex").slice(0, 12)}.json`);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
mkdirSync(stateDir, { recursive: true });
mkdirSync(out, { recursive: true });

const rounds: { round: number; found: number; fresh: string[] }[] = [];
let latest: { items: Item[]; newsletter: string } = { items: [], newsletter: "" };
let modelUsd = 0;
for (let round = 1; round <= runs; round++) {
  const seen = new Set<string>(existsSync(seenFile) ? JSON.parse(readFileSync(seenFile, "utf8")) : []);
  // 1. The posts listed on each index page (titles and addresses), in one call.
  const list = await bx.extract<{ posts: { title: string; url: string; date: string | null; source: string }[] }>({
    urls: sources,
    prompt: "The posts (articles, entries) these pages list, newest first: title, the post's link as written, date when shown, and source: the address of the page that lists it (as given).",
    schema: { type: "object", properties: { posts: { type: "array", items: { type: "object", properties: { title: { type: "string" }, url: { type: "string" }, date: { type: ["string", "null"] }, source: { type: "string" } }, required: ["title", "url", "date", "source"] } } }, required: ["posts"] },
  });
  modelUsd += list.usage.costUsd;
  // Links on index pages are often relative ("/blog/x"): resolved against the page that lists them.
  const absolute = (p: { url: string; source: string }) => {
    try {
      return new URL(p.url, sources.includes(p.source) ? p.source : sources[0]).href;
    } catch {
      return "";
    }
  };
  const fresh = list.data.posts.map((p) => ({ ...p, url: absolute(p) })).filter((p) => /^https?:\/\//.test(p.url) && !seen.has(p.url)).slice(0, maxItems);
  console.log(`Round ${round}: ${list.data.posts.length} posts listed, ${fresh.length} new`);
  // 2. The new posts themselves: a summary, why it matters, and a short post in plain words.
  let items: Item[] = [];
  if (fresh.length) {
    const r = await bx.extract<{ items: Item[] }>({
      urls: fresh.map((p) => p.url),
      prompt:
        "For each page: title; summary, two plain sentences with its most concrete detail; takeaway, one sentence on who should care; " +
        "post, a social post of at most 220 characters in plain words: no hype, no emoji, no hashtags, no link (it is added). url: the page's address as given.",
      schema: { type: "object", properties: { items: { type: "array", items: { type: "object", properties: { url: { type: "string" }, title: { type: "string" }, summary: { type: "string" }, takeaway: { type: "string" }, post: { type: "string" } }, required: ["url", "title", "summary", "takeaway", "post"] } } }, required: ["items"] },
    });
    modelUsd += r.usage.costUsd;
    items = r.data.items.map((it, i) => ({ ...it, url: fresh.find((p) => p.url === it.url)?.url ?? fresh[i]?.url ?? it.url, post: it.post.slice(0, 220).trim() }));
  }
  for (const p of fresh) seen.add(p.url);
  writeFileSync(seenFile, JSON.stringify([...seen]));
  rounds.push({ round, found: list.data.posts.length, fresh: fresh.map((p) => p.url) });

  // 3. The drafts. The newsletter is laid out here (not by the model), so every item keeps its own link.
  if (items.length) {
    const day = new Date().toISOString().slice(0, 10);
    const md = [`<!-- DRAFT: review before sending -->`, `# What's new (${day})`, "", ...items.flatMap((it) => [`## [${it.title}](${it.url})`, "", it.summary, "", `*${it.takeaway}*`, ""])].join("\n");
    const html = `<!doctype html><meta charset="utf-8"><title>What's new (${day})</title><!-- DRAFT: review before sending --><h1>What's new (${day})</h1>${items.map((it) => `<h2><a href="${esc(it.url)}">${esc(it.title)}</a></h2><p>${esc(it.summary)}</p><p><em>${esc(it.takeaway)}</em></p>`).join("")}`;
    writeFileSync(join(out, "newsletter.md"), md);
    writeFileSync(join(out, "newsletter.html"), html);
    writeFileSync(join(out, "posts.json"), JSON.stringify(items.map((it) => ({ draft: true, text: `${it.post} ${it.url}`, source: it.url })), null, 2));
    latest = { items, newsletter: md };
    for (const it of items) console.log(`  draft post: ${it.post} ${it.url}`);
  }
  console.log(`Round ${round} done: ${items.length} new items drafted.`);
  if (round === 1) console.log("Seen posts saved.");
  if (round < runs) await new Promise((res) => setTimeout(res, interval * 1000));
}
writeFileSync(join(out, "result.json"), JSON.stringify({ sources, rounds, items: latest.items, usage: { modelUsd } }, null, 2));
