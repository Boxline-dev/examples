/**
 * Compare two sites: read two product sites side by side (headline, features, pricing, what makes each different),
 * with a screenshot of each, and write a comparison report.
 *
 *   npx tsx node/index.ts            (BOXLINE_API_KEY; SITE_A and SITE_B for the two sites)
 *
 * Writes output/result.json, output/report.md and output/a.png, output/b.png.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Boxline } from "@boxline/sdk";

const out = process.env.OUTPUT_DIR ?? "output";
const sites = { a: process.env.SITE_A ?? "https://playwright.dev/", b: process.env.SITE_B ?? "https://pptr.dev/" };
const bx = new Boxline();

type Site = { url: string; name: string; headline: string; features: string[]; pricing: string; usp: string };
type Comparison = { a: Site; b: Site; shared: string[]; onlyA: string[]; onlyB: string[]; cheaper: "a" | "b" | "same" | "unknown"; summary: string };

const site = {
  type: "object",
  properties: {
    url: { type: "string" },
    name: { type: "string", description: "the product's name" },
    headline: { type: "string", description: "the main headline, as written" },
    features: { type: "array", items: { type: "string" }, description: "its main features, in a few words each" },
    pricing: { type: "string", description: "the price or pricing model as the page states it; 'not stated' when it does not" },
    usp: { type: "string", description: "what it says makes it different, in one sentence" },
  },
  required: ["url", "name", "headline", "features", "pricing", "usp"],
};

mkdirSync(out, { recursive: true });
// 1. A screenshot of each landing page (rendered in a sandboxed browser, never on this computer).
for (const [key, url] of Object.entries(sites)) {
  writeFileSync(join(out, `${key}.png`), await bx.screenshot(url, { viewport: { width: 1280, height: 800 } }));
  console.log(`Screenshot of ${url}: output/${key}.png`);
}

// 2. Both pages read in one extract call: what each says, and how they compare.
const r = await bx.extract<Comparison>({
  urls: [sites.a, sites.b],
  prompt:
    `Compare two products from their own pages. "a" is ${sites.a}, "b" is ${sites.b}. Use only what the pages say. ` +
    `shared: features both have; onlyA / onlyB: features only one has (use the same wording as in "features"). ` +
    `cheaper: which one costs less when both state a price, else "unknown". summary: two sentences for a buyer.`,
  schema: {
    type: "object",
    properties: {
      a: site,
      b: site,
      shared: { type: "array", items: { type: "string" } },
      onlyA: { type: "array", items: { type: "string" } },
      onlyB: { type: "array", items: { type: "string" } },
      cheaper: { type: "string", enum: ["a", "b", "same", "unknown"] },
      summary: { type: "string" },
    },
    required: ["a", "b", "shared", "onlyA", "onlyB", "cheaper", "summary"],
  },
});
const c = r.data;
for (const [key, s] of [["a", c.a], ["b", c.b]] as const) {
  console.log(`\n${key.toUpperCase()}: ${s.name} (${sites[key]})\n  "${s.headline}"\n  features: ${s.features.join(", ")}\n  pricing: ${s.pricing}\n  different: ${s.usp}`);
}
console.log(`\nBoth: ${c.shared.join(", ") || "nothing in common"}\nOnly ${c.a.name}: ${c.onlyA.join(", ") || "-"}\nOnly ${c.b.name}: ${c.onlyB.join(", ") || "-"}`);
console.log(`Cheaper: ${c.cheaper === "a" ? c.a.name : c.cheaper === "b" ? c.b.name : c.cheaper}\n\n${c.summary}`);

const row = (label: string, f: (s: Site) => string) => `| ${label} | ${f(c.a)} | ${f(c.b)} |`;
const report = [
  `# ${c.a.name} vs ${c.b.name}`,
  "",
  c.summary,
  "",
  `| | [${c.a.name}](${sites.a}) | [${c.b.name}](${sites.b}) |`,
  "|---|---|---|",
  row("Headline", (s) => s.headline),
  row("Pricing", (s) => s.pricing),
  row("Features", (s) => s.features.join("<br>")),
  row("What is different", (s) => s.usp),
  "",
  `In both: ${c.shared.join(", ") || "nothing"}.`,
  "",
  `| ${c.a.name} | ${c.b.name} |`,
  "|---|---|",
  "| ![](a.png) | ![](b.png) |",
  "",
].join("\n");
writeFileSync(join(out, "report.md"), report);
writeFileSync(join(out, "result.json"), JSON.stringify({ sites, ...c, pages: r.pages, model: r.model, usage: { modelUsd: r.usage.costUsd } }, null, 2));
console.log(`\nReport: ${join(out, "report.md")} ($${r.usage.costUsd.toFixed(4)} of model use)`);
