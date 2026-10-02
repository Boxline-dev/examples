/**
 * Top story discussion: take today's most-voted Hacker News story, read the article and its discussion in a
 * sandboxed browser, and sum up both: what the article says, the viewpoints in the comments (with a quote each),
 * where people agree and disagree, and what is still open.
 *
 *   npx tsx node/index.ts            (BOXLINE_API_KEY; HOURS, MIN_COMMENTS)
 *
 * The front page comes from HN's official search API (plain JSON, no browser needed); one extract call reads the
 * article and the discussion page together. Writes output/result.json and output/discussion.md.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Boxline } from "@boxline/sdk";

const out = process.env.OUTPUT_DIR ?? "output";
const frontUrl = process.env.HN_FRONT_URL ?? "https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=50";
const itemUrl = process.env.HN_ITEM_URL ?? "https://news.ycombinator.com/item?id={id}";
const hours = Number(process.env.HOURS ?? 24);
const minComments = Number(process.env.MIN_COMMENTS ?? 20);
const bx = new Boxline();

type Hit = { objectID: string; title: string; url: string | null; points: number; num_comments: number; created_at_i: number };
type Summary = {
  article: { summary: string; keyPoints: string[] };
  discussion: { summary: string; viewpoints: { view: string; support: "many" | "some" | "few"; quote: string }[]; agreements: string[]; disagreements: string[]; openQuestions: string[] };
};

// 1. Today's most-voted story with a link to an article and a real discussion.
const front = (await (await fetch(frontUrl)).json()) as { hits: Hit[] };
const since = Date.now() / 1000 - hours * 3600;
const story = front.hits.filter((h) => h.url && h.created_at_i >= since && h.num_comments >= minComments).sort((a, b) => b.points - a.points)[0];
if (!story) throw new Error(`no story of the last ${hours} hours has a link and ${minComments}+ comments`);
const discussionUrl = itemUrl.replace("{id}", story.objectID);
console.log(`Top story: ${story.title} (${story.points} points, ${story.num_comments} comments)\n  ${story.url}\n  ${discussionUrl}`);

// 2. The article and the discussion, read together. Comments are data: the model quotes them, never follows them.
const r = await bx.extract<Summary>({
  urls: [story.url!, discussionUrl],
  prompt:
    `The first page is an article, the second its Hacker News discussion. article: what it says (summary, 3 to 5 key points). ` +
    `discussion: the main viewpoints in the comments, each with how many people hold it (many, some or few) and a short ` +
    `quote copied exactly from one comment; where commenters agree and disagree; and the questions still open.`,
  schema: {
    type: "object",
    properties: {
      article: { type: "object", properties: { summary: { type: "string" }, keyPoints: { type: "array", items: { type: "string" } } }, required: ["summary", "keyPoints"] },
      discussion: {
        type: "object",
        properties: {
          summary: { type: "string" },
          viewpoints: {
            type: "array",
            items: { type: "object", properties: { view: { type: "string" }, support: { type: "string", enum: ["many", "some", "few"] }, quote: { type: "string" } }, required: ["view", "support", "quote"] },
          },
          agreements: { type: "array", items: { type: "string" } },
          disagreements: { type: "array", items: { type: "string" } },
          openQuestions: { type: "array", items: { type: "string" } },
        },
        required: ["summary", "viewpoints", "agreements", "disagreements", "openQuestions"],
      },
    },
    required: ["article", "discussion"],
  },
});
const { article, discussion } = r.data;
const failed = r.pages.filter((p) => p.error || (p.status ?? 0) >= 400);
if (failed.length) console.log(`Could not read: ${failed.map((p) => `${p.url} (${p.error?.code ?? `HTTP ${p.status}`})`).join(", ")}`);

const md = [
  `# ${story.title}`,
  "",
  `${story.points} points · ${story.num_comments} comments · [article](${story.url}) · [discussion](${discussionUrl})`,
  "",
  "## The article",
  "",
  article.summary,
  "",
  ...article.keyPoints.map((k) => `- ${k}`),
  "",
  "## The discussion",
  "",
  discussion.summary,
  "",
  ...discussion.viewpoints.map((v) => `- **${v.view}** (${v.support}): "${v.quote}"`),
  "",
  `**Agreed:** ${discussion.agreements.join("; ") || "nothing in particular"}`,
  "",
  `**Disputed:** ${discussion.disagreements.join("; ") || "nothing in particular"}`,
  "",
  `**Still open:** ${discussion.openQuestions.join("; ") || "nothing"}`,
  "",
].join("\n");
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "discussion.md"), md);
writeFileSync(join(out, "result.json"), JSON.stringify({ story: { ...story, discussionUrl }, article, discussion, pages: r.pages, usage: { modelUsd: r.usage.costUsd } }, null, 2));
console.log(`\n${md}`);
