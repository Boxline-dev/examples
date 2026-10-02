/**
 * Watch competitor pages: check a few pages, tell real changes (a price, a plan, a feature, an announcement) from
 * noise (a date, a counter), and post the real ones to your chat webhook.
 *
 *   npx tsx node/index.ts            (BOXLINE_API_KEY; PAGES, a comma-separated list; SLACK_WEBHOOK_URL optional)
 *
 * Each check fetches the page as text (cheap). Only when the text changed does a model read the page into facts
 * (prices, features, announcements), and the code compares those facts with the last ones: what changed is exact,
 * and a page whose only change is a timestamp is "noise". The facts are kept in STATE_DIR between runs; RUNS=n and
 * INTERVAL_SECONDS repeat the check (run it from cron, or a Boxline task, for a real schedule).
 * Writes output/result.json and output/alerts.md.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Boxline } from "@boxline/sdk";

const out = process.env.OUTPUT_DIR ?? "output";
const stateDir = process.env.STATE_DIR ?? join(out, "state");
const pages = (process.env.PAGES ?? "https://nodejs.org/en/about/previous-releases,https://www.python.org/downloads/").split(",").map((u) => u.trim()).filter(Boolean);
const runs = Number(process.env.RUNS ?? 1);
const interval = Number(process.env.INTERVAL_SECONDS ?? 3600);
const chatHook = process.env.SLACK_WEBHOOK_URL;
const bx = new Boxline();

type Facts = { title: string; prices: { item: string; price: string }[]; features: string[]; announcements: string[] };
type State = { url: string; hash: string; facts: Facts; checkedAt: string };
const FACTS = {
  type: "object",
  properties: {
    title: { type: "string" },
    prices: { type: "array", items: { type: "object", properties: { item: { type: "string", description: "a plan or product name" }, price: { type: "string", description: "as written, e.g. $29" } }, required: ["item", "price"] } },
    features: { type: "array", items: { type: "string" }, description: "features or included items the page lists" },
    announcements: { type: "array", items: { type: "string" }, description: "news, posts or release names, by their headline" },
  },
  required: ["title", "prices", "features", "announcements"],
};

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const file = (url: string) => join(stateDir, `${sha(url).slice(0, 16)}.json`);
const load = (url: string): State | null => (existsSync(file(url)) ? JSON.parse(readFileSync(file(url), "utf8")) : null);

/** What changed between two sets of facts, in plain words (empty: nothing that matters). */
function diff(a: Facts, b: Facts): string[] {
  const changes: string[] = [];
  const before = new Map(a.prices.map((p) => [p.item.toLowerCase(), p]));
  const after = new Map(b.prices.map((p) => [p.item.toLowerCase(), p]));
  for (const [k, p] of after) {
    const old = before.get(k);
    if (!old) changes.push(`new price: ${p.item} ${p.price}`);
    else if (old.price !== p.price) changes.push(`price of ${p.item}: ${old.price} → ${p.price}`);
  }
  for (const [k, p] of before) if (!after.has(k)) changes.push(`price removed: ${p.item} (was ${p.price})`);
  const list = (label: string, x: string[], y: string[]) => {
    const xs = new Set(x.map((v) => v.toLowerCase()));
    const ys = new Set(y.map((v) => v.toLowerCase()));
    for (const v of y) if (!xs.has(v.toLowerCase())) changes.push(`${label} added: ${v}`);
    for (const v of x) if (!ys.has(v.toLowerCase())) changes.push(`${label} removed: ${v}`);
  };
  list("feature", a.features, b.features);
  list("announcement", a.announcements, b.announcements);
  return changes;
}

mkdirSync(stateDir, { recursive: true });
const rounds: { round: number; at: string; pages: { url: string; status: "baseline" | "same" | "noise" | "changed" | "failed"; changes: string[]; error?: string }[] }[] = [];
let modelUsd = 0;
let alertsSent = 0;
const alerts: string[] = [];

for (let round = 1; round <= runs; round++) {
  const at = new Date().toISOString();
  const seen: (typeof rounds)[number]["pages"] = [];
  for (const url of pages) {
    try {
      const page = await bx.fetch(url, { format: "text" }); // a real browser in a sandbox; no model, no cost per token
      const hash = sha(page.content);
      const prev = load(url);
      if (prev && prev.hash === hash) {
        seen.push({ url, status: "same", changes: [] });
        console.log(`  same      ${url}`);
        continue;
      }
      // The text changed (or this is the first look): read the page into facts. The last facts go into the prompt
      // so unchanged items keep the same wording, and the comparison below stays exact.
      const hint = prev ? `\nLast time the facts were (keep this wording for items that did not change): ${JSON.stringify(prev.facts).slice(0, 3000)}` : "";
      const r = await bx.extract<Facts>({ url, prompt: `The page's prices, features and announcements, as listed on it.${hint}`, schema: FACTS });
      modelUsd += r.usage.costUsd;
      const changes = prev ? diff(prev.facts, r.data) : [];
      const status = !prev ? "baseline" : changes.length ? "changed" : "noise";
      writeFileSync(file(url), JSON.stringify({ url, hash, facts: r.data, checkedAt: at } satisfies State, null, 2));
      seen.push({ url, status, changes });
      console.log(`  ${status.padEnd(9)} ${url}${changes.map((c) => `\n              ${c}`).join("")}`);
      if (changes.length) alerts.push(`*${r.data.title}* (${url})\n${changes.map((c) => `• ${c}`).join("\n")}`);
    } catch (err) {
      seen.push({ url, status: "failed", changes: [], error: (err as Error).message });
      console.log(`  failed    ${url}: ${(err as Error).message}`);
    }
  }
  rounds.push({ round, at, pages: seen });
  const fresh = alerts.splice(0);
  if (fresh.length) {
    const text = `Competitor changes (${at.slice(0, 16).replace("T", " ")} UTC)\n\n${fresh.join("\n\n")}`;
    writeFileSync(join(out, "alerts.md"), `${existsSync(join(out, "alerts.md")) ? readFileSync(join(out, "alerts.md"), "utf8") + "\n\n" : ""}${text}`);
    if (chatHook) {
      const res = await fetch(chatHook, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
      if (res.ok) alertsSent++;
      console.log(res.ok ? "  posted the changes to the chat webhook" : `  the chat webhook answered ${res.status}`);
    }
  }
  console.log(`Round ${round} done: ${seen.filter((p) => p.status === "changed").length} changed, ${seen.filter((p) => p.status === "noise").length} noise only.`);
  if (round === 1 && seen.some((p) => p.status === "baseline")) console.log("Baseline saved.");
  if (round < runs) await new Promise((r) => setTimeout(r, interval * 1000));
}

writeFileSync(join(out, "result.json"), JSON.stringify({ pages, rounds, alertsSent, usage: { modelUsd } }, null, 2));
