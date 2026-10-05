/**
 * Tech signals: find the themes many Hacker News stories of the last days share, read each theme's stories, and make
 * one grounded prediction per theme, with the facts from the pages it rests on.
 *
 *   npx tsx node/index.ts            (BOXLINE_API_KEY; a plan with shell sessions; WINDOW_HOURS, MIN_POINTS, TOP)
 *
 * signals.py does the collecting and clustering in the session's shell (HN's official search API); then one extract
 * call per theme reads up to 3 of its stories' pages. Writes output/result.json and output/predictions.md.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Boxline } from "@boxline/sdk";

const here = dirname(fileURLToPath(import.meta.url));
const out = process.env.OUTPUT_DIR ?? "output";
const env = {
  HN_SEARCH_URL: process.env.HN_SEARCH_URL ?? "https://hn.algolia.com/api/v1/search_by_date",
  WINDOW_HOURS: process.env.WINDOW_HOURS ?? "48",
  MIN_POINTS: process.env.MIN_POINTS ?? "50",
  TOP: process.env.TOP ?? "3",
  SPECIFICITY: process.env.SPECIFICITY ?? "4.5",
};
const bx = new Boxline();

type Story = { id: string; title: string; url: string; points: number; comments: number };
type Theme = { label: string; score: number; stories: Story[] };
type Prediction = { claim: string; rationale: string; confidence: "low" | "medium" | "high"; evidence: { url: string; fact: string }[] };

const session = await bx.sessions.create({ browser: false, shell: true, setup: ["pip install -q wordfreq"], timeout: 600, idleTimeout: 300, userMetadata: { example: "tech-signals" } });
console.log(`Session: ${session.id}`);
let signals: { collected: number; windowHours: number; themes: Theme[] };
try {
  await session.files.write("signals.py", readFileSync(join(here, "../signals.py")));
  const r = await session.exec("python signals.py", { env, timeoutMs: 180_000 });
  if (r.exitCode !== 0) throw new Error(`signals.py failed: ${r.stderr.trim()}`);
  console.log(r.stdout.trim());
  signals = JSON.parse(await session.files.readText("signals.json"));
} finally {
  await session.stop(); // the predictions below need no machine of ours
}
if (!signals.themes.length) throw new Error("no theme is shared by two stories in this window; widen WINDOW_HOURS or lower MIN_POINTS");

// One prediction per theme, from what its stories' pages say (not just their titles).
const predictions: (Prediction & { theme: string; stories: Story[]; pages: unknown[] })[] = [];
let modelUsd = 0;
for (const theme of signals.themes) {
  const stories = theme.stories.slice(0, 3);
  const r = await bx.extract<Prediction>({
    urls: stories.map((s) => s.url),
    prompt:
      `These pages are recent stories that share one theme: "${theme.label}". Make one prediction about where this is going in ` +
      `the next 6 to 12 months. claim: at most 30 words. rationale: why, from what the pages say. confidence: low, medium or high. ` +
      `evidence: 2 to 4 facts as the pages state them, each with the URL of its page (one of the pages given).`,
    schema: {
      type: "object",
      properties: {
        claim: { type: "string" },
        rationale: { type: "string" },
        confidence: { type: "string", enum: ["low", "medium", "high"] },
        evidence: { type: "array", items: { type: "object", properties: { url: { type: "string" }, fact: { type: "string" } }, required: ["url", "fact"] } },
      },
      required: ["claim", "rationale", "confidence", "evidence"],
    },
  });
  modelUsd += r.usage.costUsd;
  predictions.push({ theme: theme.label, stories, pages: r.pages, ...r.data });
  console.log(`\n${theme.label} (${theme.stories.length} stories, score ${theme.score})\n  → ${r.data.claim} [${r.data.confidence}]\n  ${r.data.rationale}`);
  for (const e of r.data.evidence) console.log(`    · ${e.fact} (${e.url})`);
}

const md = [
  `# Tech signals: the last ${signals.windowHours} hours`,
  "",
  `${signals.collected} Hacker News stories; the themes several of them share, and where each may be going.`,
  "",
  ...predictions.flatMap((p) => [
    `## ${p.theme}`,
    "",
    `**${p.claim}** (confidence: ${p.confidence})`,
    "",
    p.rationale,
    "",
    ...p.evidence.map((e) => `- ${e.fact} ([source](${e.url}))`),
    "",
    `Stories: ${p.stories.map((s) => `[${s.title}](${s.url}) (${s.points} points)`).join(" · ")}`,
    "",
  ]),
].join("\n");
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "predictions.md"), md);
writeFileSync(join(out, "result.json"), JSON.stringify({ collected: signals.collected, windowHours: signals.windowHours, themes: signals.themes, predictions, usage: { modelUsd } }, null, 2));
console.log(`\nWrote ${join(out, "predictions.md")} ($${modelUsd.toFixed(4)} of model use)`);
