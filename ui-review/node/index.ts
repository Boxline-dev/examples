/**
 * UI review: a design check of a page from what the browser actually renders, at desktop and phone width: its colour
 * palette, fonts and sizes, text that fails WCAG contrast (computed), images without alt text, skipped heading
 * levels, sideways scrolling and too-small tap targets on a phone, with screenshots and the top fixes in plain words.
 *
 *   npx tsx node/index.ts            (BOXLINE_API_KEY; PAGE_URL)
 *
 * measure.js runs in the page; the fixes are written by a model from those measurements. Writes output/result.json,
 * output/review.md, output/desktop.png and output/phone.png.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Boxline } from "@boxline/sdk";

const here = dirname(fileURLToPath(import.meta.url));
const out = process.env.OUTPUT_DIR ?? "output";
const url = process.env.PAGE_URL ?? "https://books.toscrape.com/";
const measure = readFileSync(join(here, "../measure.js"), "utf8");
const bx = new Boxline();

type Measures = {
  viewport: number;
  palette: { value: string; count: number }[];
  fonts: { value: string; count: number }[];
  sizes: { value: string; count: number }[];
  contrastFailures: { text: string; color: string; background: string; ratio: number; needs: number; sizePx: number }[];
  imagesWithoutAlt: string[];
  headingSkips: string[];
  horizontalOverflow: boolean;
  overflowing: string[];
  smallTargets: { target: string; width: number; height: number }[];
};

/** Opens the page at one viewport, measures it and keeps a screenshot. */
async function look(name: string, viewport: { width: number; height: number }): Promise<Measures> {
  const session = await bx.sessions.create({ viewport, timeout: 180, userMetadata: { example: "ui-review" } });
  console.log(`Session: ${session.id} (${name}, ${viewport.width}×${viewport.height})`);
  try {
    await session.goto(url, { waitUntil: "load" });
    const shot = await session.screenshot({ fullPage: true });
    writeFileSync(join(out, `${name}.png`), Buffer.from(shot.data, "base64"));
    return await session.evaluate<Measures>(measure);
  } finally {
    await session.stop();
  }
}

mkdirSync(out, { recursive: true });
const desktop = await look("desktop", { width: 1280, height: 800 });
const phone = await look("phone", { width: 375, height: 812 });

// The fixes, from the measurements (the model sees the numbers and the page text, not a guess at the pixels).
const findings = { contrast: desktop.contrastFailures.slice(0, 10), imagesWithoutAlt: desktop.imagesWithoutAlt.length, headingSkips: desktop.headingSkips, phone: { horizontalOverflow: phone.horizontalOverflow, overflowing: phone.overflowing, smallTargets: phone.smallTargets.slice(0, 10) }, palette: desktop.palette.map((p) => p.value), fonts: desktop.fonts.map((f) => f.value) };
const r = await bx.extract<{ summary: string; fixes: { fix: string; why: string; priority: "high" | "medium" | "low" }[] }>({
  url,
  prompt: `A design review of this page. Measurements from the browser: ${JSON.stringify(findings).slice(0, 3500)}. summary: two sentences on the page's look and its main problems. fixes: up to 6, most important first, each concrete (which element, what to change), why it matters, and a priority. Base them on the measurements.`,
  schema: { type: "object", properties: { summary: { type: "string" }, fixes: { type: "array", items: { type: "object", properties: { fix: { type: "string" }, why: { type: "string" }, priority: { type: "string", enum: ["high", "medium", "low"] } }, required: ["fix", "why", "priority"] } } }, required: ["summary", "fixes"] },
});

console.log(`\nPalette: ${desktop.palette.map((p) => p.value).join(" ")}\nFonts: ${desktop.fonts.map((f) => f.value).join(", ")}; sizes ${desktop.sizes.map((s) => s.value).join(", ")}`);
console.log(`Contrast failures: ${desktop.contrastFailures.length}${desktop.contrastFailures.slice(0, 3).map((c) => `\n  "${c.text}" ${c.color} on ${c.background}: ${c.ratio}:1 (needs ${c.needs}:1)`).join("")}`);
console.log(`Images without alt: ${desktop.imagesWithoutAlt.length}; heading skips: ${desktop.headingSkips.join(", ") || "none"}`);
console.log(`Phone: ${phone.horizontalOverflow ? `scrolls sideways (${phone.overflowing.join(", ")})` : "fits"}; small tap targets: ${phone.smallTargets.length}`);
console.log(`\n${r.data.summary}\n${r.data.fixes.map((f) => `  [${f.priority}] ${f.fix}`).join("\n")}`);

const md = [
  `# UI review: ${url}`,
  "",
  r.data.summary,
  "",
  "## Fixes",
  "",
  ...r.data.fixes.map((f) => `- **${f.priority}**: ${f.fix} (${f.why})`),
  "",
  "## Measured",
  "",
  `- Palette: ${desktop.palette.map((p) => `\`${p.value}\``).join(" ")}`,
  `- Fonts: ${desktop.fonts.map((f) => f.value).join(", ")}; sizes: ${desktop.sizes.map((s) => s.value).join(", ")}`,
  `- Contrast failures (WCAG AA): ${desktop.contrastFailures.length}${desktop.contrastFailures.map((c) => `\n  - "${c.text}": ${c.color} on ${c.background}, ${c.ratio}:1 (needs ${c.needs}:1)`).join("")}`,
  `- Images without alt text: ${desktop.imagesWithoutAlt.length}`,
  `- Heading levels skipped: ${desktop.headingSkips.join(", ") || "none"}`,
  `- Phone (375 px): ${phone.horizontalOverflow ? `scrolls sideways because of ${phone.overflowing.join(", ")}` : "fits the width"}; tap targets under 24 px: ${phone.smallTargets.map((t) => `${t.target} (${t.width}×${t.height})`).join(", ") || "none"}`,
  "",
  "| Desktop | Phone |",
  "|---|---|",
  "| ![](desktop.png) | ![](phone.png) |",
  "",
].join("\n");
writeFileSync(join(out, "review.md"), md);
writeFileSync(join(out, "result.json"), JSON.stringify({ url, desktop, phone, summary: r.data.summary, fixes: r.data.fixes, usage: { modelUsd: r.usage.costUsd } }, null, 2));
