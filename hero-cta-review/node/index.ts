/**
 * Hero CTA review: does the landing page's main call to action work? A computer-use agent looks at the page the way a
 * visitor does and picks the hero's main button; then the button is measured in the page (contrast, size, position,
 * accessible name), its link is checked, and a short critique says what to change.
 *
 *   npx tsx node/index.ts            (BOXLINE_API_KEY; PAGE_URL; a model with a computer-use tool on the API)
 *
 * The agent only looks (it is told not to click or type). Writes output/result.json, output/review.md, output/hero.png.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Boxline } from "@boxline/sdk";

const here = dirname(fileURLToPath(import.meta.url));
const out = process.env.OUTPUT_DIR ?? "output";
const url = process.env.PAGE_URL ?? "https://www.mozilla.org/en-US/firefox/";
const measure = readFileSync(join(here, "../measure-cta.js"), "utf8").replace(/^\s*\/\/.*$/gm, "").trim();
const bx = new Boxline();

type Seen = { text: string; why: string; otherCandidates: string[] };
type Measured = { tag: string; text: string; accessibleName: string; href: string | null; color: string; background: string; contrast: number; needs: number; fontSizePx: number; width: number; height: number; centre: { x: number; y: number }; aboveTheFold: boolean; otherButtons: string[] };

const session = await bx.sessions.create({ viewport: { width: 1280, height: 800 }, timeout: 600, idleTimeout: 300, userMetadata: { example: "hero-cta-review" } });
console.log(`Session: ${session.id}`);
mkdirSync(out, { recursive: true });
let seen!: Seen;
let cta: Measured | null = null;
let runId = "";
try {
  await session.goto(url, { waitUntil: "load" });
  writeFileSync(join(out, "hero.png"), Buffer.from((await session.screenshot()).data, "base64"));
  // 1. What a visitor sees as the main call to action: the agent works from screenshots (computer mode).
  const started = await bx.agent.run({
    sessionId: session.id,
    mode: "computer",
    maxSteps: 6,
    task: `Look at the page that is open (do not click, type or scroll away). In the hero section at the top, which is the main call-to-action button or link: the one the page most wants a visitor to press? Give its exact visible text, why it is the main one, and the texts of other buttons or links that compete with it in the hero.`,
    output: {
      type: "object",
      properties: {
        text: { type: "string", description: "the button's visible text exactly as written on it, and nothing else (no quotes, no sentence)" },
        why: { type: "string", description: "one sentence" },
        otherCandidates: { type: "array", items: { type: "string" }, description: "the visible texts of competing buttons or links" },
      },
      required: ["text", "why", "otherCandidates"],
    },
  });
  console.log(`Agent run ${started.id} (${started.model}, computer use) is looking at the hero…`);
  runId = started.id;
  const run = await bx.agent.wait<Seen>(started.id);
  if (run.status !== "completed" || !run.result) throw new Error(`the agent run ${run.status}: ${run.error ?? "no answer"}`);
  seen = run.result;
  console.log(`Main CTA: "${seen.text}" (${seen.why})`);
  // 2. The same element, measured exactly in the page.
  cta = await session.evaluate<Measured | null>(`(${measure})(${JSON.stringify(seen.text)})`);
} finally {
  await session.stop();
}
if (!cta) throw new Error(`no button or link with the text "${seen.text}" was found in the page`);

// 3. Where it leads (a sandboxed browser opens the link).
const link = cta.href && /^https?:/.test(cta.href) ? await bx.fetch(cta.href, { format: "text" }).then((p) => ({ status: p.status, title: p.title, finalUrl: p.finalUrl }), (e: Error) => ({ status: null, title: "", finalUrl: null, error: e.message })) : null;
const problems = [
  cta.contrast < cta.needs && `text contrast ${cta.contrast}:1 (${cta.color} on ${cta.background}) is below WCAG AA's ${cta.needs}:1`,
  (cta.width < 44 || cta.height < 44) && `${cta.width} × ${cta.height} px is small to tap (44 × 44 is comfortable)`,
  !cta.aboveTheFold && "it is not fully visible without scrolling",
  !cta.accessibleName && "it has no accessible name",
  link && (link.status === null || link.status >= 400) && `its link answers ${link.status ?? "nothing"}`,
].filter(Boolean) as string[];

// 4. A short critique from the measurements.
const r = await bx.extract<{ verdict: string; suggestions: string[] }>({
  url,
  prompt: `The landing page's main call to action is "${cta.text}". Measured: ${JSON.stringify({ ...cta, otherButtons: cta.otherButtons, link, problems })}. Competing calls to action the visitor sees: ${seen.otherCandidates.join("; ") || "none"}. verdict: two sentences on how well it works. suggestions: up to 4 concrete changes (wording, colour, size, placement), each grounded in the measurements or the page.`,
  schema: { type: "object", properties: { verdict: { type: "string" }, suggestions: { type: "array", items: { type: "string" } } }, required: ["verdict", "suggestions"] },
});

console.log(`Measured: ${cta.width}×${cta.height} px at (${cta.centre.x}, ${cta.centre.y}), ${cta.color} on ${cta.background} = ${cta.contrast}:1, ${cta.aboveTheFold ? "above the fold" : "below the fold"}`);
console.log(`Link: ${cta.href} → ${link ? `${link.status} "${link.title}"` : "none"}`);
for (const p of problems) console.log(`  ! ${p}`);
console.log(`\n${r.data.verdict}\n${r.data.suggestions.map((s) => `  - ${s}`).join("\n")}`);
const md = [`# Hero CTA review: ${url}`, "", `**"${cta.text}"**: ${seen.why}`, "", r.data.verdict, "", "## Measured", "", `- ${cta.width} × ${cta.height} px, ${cta.aboveTheFold ? "above the fold" : "below the fold"}`, `- ${cta.color} on ${cta.background}: ${cta.contrast}:1 (needs ${cta.needs}:1)`, `- Leads to ${cta.href ?? "nothing"}${link ? ` (${link.status})` : ""}`, ...problems.map((p) => `- Problem: ${p}`), "", "## Suggestions", "", ...r.data.suggestions.map((s) => `- ${s}`), "", "![The hero](hero.png)", ""].join("\n");
writeFileSync(join(out, "review.md"), md);
writeFileSync(join(out, "result.json"), JSON.stringify({ url, seen, cta, link, problems, verdict: r.data.verdict, suggestions: r.data.suggestions, agentRuns: [{ id: runId }], usage: { modelUsd: r.usage.costUsd } }, null, 2));
