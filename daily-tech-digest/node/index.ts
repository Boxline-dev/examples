/**
 * Daily tech digest: collect today's stories from Hacker News and a few blogs, keep the ones on your topics, rank
 * them, read the top ones in a sandboxed browser and summarise them, then make a Markdown digest and a PDF slide deck
 * and post the digest to your chat.
 *
 *   npx tsx node/index.ts            (BOXLINE_API_KEY; a plan with shell sessions; INCLUDE, FEEDS, TOP, SLACK_WEBHOOK_URL)
 *
 * The machine does the plumbing: collect.py gathers the stories in the session's shell (Hacker News' official search
 * API and the feeds), and deck.py builds the PDF there with fpdf2 (installed by the session's setup). One extract
 * call reads the top stories' pages. Writes output/result.json, output/digest.md and output/deck.pdf.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Boxline } from "@boxline/sdk";

const here = dirname(fileURLToPath(import.meta.url));
const out = process.env.OUTPUT_DIR ?? "output";
const hnUrl = process.env.HN_URL ?? "https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=50";
const feeds = process.env.FEEDS ?? "https://github.blog/feed/,https://aws.amazon.com/blogs/aws/feed/";
const words = (v: string | undefined) => (v ?? "").split(",").map((w) => w.trim().toLowerCase()).filter(Boolean);
const include = words(process.env.INCLUDE ?? "ai,llm,agent,agents,browser,security,database,open source");
const exclude = words(process.env.EXCLUDE);
const top = Math.min(Number(process.env.TOP ?? 5), 10); // one extract call reads at most 10 pages
const maxAgeHours = Number(process.env.MAX_AGE_HOURS ?? 48);
const chatHook = process.env.SLACK_WEBHOOK_URL;
const bx = new Boxline();

type Item = { source: "hn" | "feed"; feed?: string; title: string; url: string; discussion?: string; points: number; comments: number; at: number | null };
const hits = (title: string, list: string[]) => list.filter((w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(title));

const session = await bx.sessions.create({
  browser: false,
  shell: true,
  setup: ["pip install -q fpdf2"],
  timeout: 900,
  idleTimeout: 300,
  userMetadata: { example: "daily-tech-digest" },
});
console.log(`Session: ${session.id}`);
try {
  // 1. Collect on the machine: the scripts go into /workspace, the sources' addresses in as environment variables.
  await session.files.write("collect.py", readFileSync(join(here, "../collect.py")));
  await session.files.write("deck.py", readFileSync(join(here, "../deck.py")));
  const c = await session.exec("python collect.py", { env: { HN_URL: hnUrl, FEEDS: feeds }, timeoutMs: 120_000 });
  if (c.exitCode !== 0) throw new Error(`collect.py failed: ${c.stderr.trim()}`);
  console.log(c.stdout.trim());
  const collected = JSON.parse(await session.files.readText("items.json")) as { collectedAt: number; items: Item[]; errors: string[] };

  // 2. Keep the fresh ones on your topics, then rank: points per hour and comments for Hacker News, a steady score
  //    for blogs (their posts are chosen by their editors), plus each topic word the title matches.
  const now = collected.collectedAt;
  const seen = new Set<string>();
  const kept = collected.items
    .filter((i) => !seen.has(i.url) && seen.add(i.url))
    .filter((i) => (include.length ? hits(i.title, include).length > 0 : true) && hits(i.title, exclude).length === 0)
    .filter((i) => i.at === null || (now - i.at) / 3600 <= maxAgeHours)
    .map((i) => {
      const hours = Math.max((now - (i.at ?? now)) / 3600, 1);
      const base = i.source === "hn" ? 2 * Math.log10(1 + i.points / hours) + Math.log10(1 + i.comments) : 2.5 - Math.min(hours / 48, 1);
      return { ...i, score: Math.round((base + 0.5 * hits(i.title, include).length) * 100) / 100 };
    })
    .sort((a, b) => b.score - a.score);
  const chosen = kept.slice(0, top);
  console.log(`${collected.items.length} collected, ${kept.length} on your topics; the top ${chosen.length}:`);
  for (const i of chosen) console.log(`  ${i.score.toFixed(2)}  ${i.title}  (${i.source === "hn" ? `${i.points} points` : new URL(i.url).host})`);
  if (!chosen.length) throw new Error("nothing matched your topics; widen INCLUDE or add FEEDS");

  // 3. Read the chosen pages and summarise them in one call (a page that does not load is listed with an error).
  const r = await bx.extract<{ stories: { url: string; summary: string; whyItMatters: string }[] }>({
    urls: chosen.map((i) => i.url),
    prompt: "For each page: summary, two sentences on what it says, with its most concrete fact or number; whyItMatters, one sentence for an engineer. url: the page's address as given.",
    schema: {
      type: "object",
      properties: {
        stories: {
          type: "array",
          items: { type: "object", properties: { url: { type: "string" }, summary: { type: "string" }, whyItMatters: { type: "string" } }, required: ["url", "summary", "whyItMatters"] },
        },
      },
      required: ["stories"],
    },
  });
  const key = (u: string) => u.replace(/[#?].*$/, "").replace(/\/$/, "");
  const byUrl = new Map(r.data.stories.map((s) => [key(s.url), s]));
  const all = chosen.map((i, n) => {
    const page = r.pages[n];
    // A page that did not load, or answered with an error (a 503 page is not the article), is not summarised.
    const why = page?.error ? page.error.code : page && page.status !== null && page.status >= 400 ? `HTTP ${page.status}` : null;
    const s = why ? undefined : (byUrl.get(key(i.url)) ?? byUrl.get(key(page?.finalUrl ?? "")));
    return {
      title: i.title,
      url: i.url,
      where: i.source === "hn" ? `Hacker News · ${i.points} points · ${i.comments} comments` : new URL(i.url).host,
      read: Boolean(s),
      summary: s?.summary ?? `The page could not be read (${why ?? "no summary"}).`,
      whyItMatters: s?.whyItMatters ?? "",
      score: i.score,
    };
  });
  const stories = all.filter((x) => x.read);
  const unread = all.filter((x) => !x.read);
  if (!stories.length) throw new Error(`none of the top pages could be read: ${unread.map((x) => `${x.url} (${x.summary})`).join("; ")}`);

  // 4. The digest: Markdown here, a PDF deck built in the shell, and a chat post.
  const day = new Date(now * 1000).toISOString().slice(0, 10);
  const digest = { title: `Tech digest, ${day}`, subtitle: `${stories.length} stories from ${collected.items.length} collected (${include.join(", ")})`, stories };
  const md = [
    `# ${digest.title}`,
    "",
    digest.subtitle,
    "",
    ...stories.flatMap((s, n) => [`## ${n + 1}. [${s.title}](${s.url})`, "", `*${s.where}*`, "", s.summary, "", `**Why it matters:** ${s.whyItMatters}`, ""]),
    ...(unread.length ? ["## Could not be read", "", ...unread.map((s) => `- [${s.title}](${s.url}): ${s.summary}`), ""] : []),
  ].join("\n");
  await session.files.write("digest.json", JSON.stringify(digest));
  const deck = await session.exec("python deck.py", { timeoutMs: 120_000 });
  if (deck.exitCode !== 0) throw new Error(`deck.py failed: ${deck.stderr.trim()}`);
  console.log(deck.stdout.trim());
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "deck.pdf"), await session.files.read("deck.pdf"));
  writeFileSync(join(out, "digest.md"), md);

  let alertsSent = 0;
  if (chatHook) {
    const text = `*${digest.title}*\n\n${stories.map((s, n) => `${n + 1}. <${s.url}|${s.title}>\n${s.summary}`).join("\n\n")}`;
    const res = await fetch(chatHook, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
    alertsSent = res.ok ? 1 : 0;
    console.log(res.ok ? "Posted the digest to the chat webhook." : `The chat webhook answered ${res.status}.`);
  }
  writeFileSync(
    join(out, "result.json"),
    JSON.stringify({ collected: collected.items.length, sourceErrors: collected.errors, kept: kept.length, stories, unread, pages: r.pages, alertsSent, usage: { modelUsd: r.usage.costUsd } }, null, 2),
  );
  console.log(`\n${md}`);
} finally {
  await session.release();
}
