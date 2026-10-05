/**
 * Accessibility check: run the axe-core scan on a page in the session's browser and list the issues, worst first.
 * The shell fetches axe-core (inside the machine); Playwright runs it in the page.
 *
 *   npx tsx node/index.ts            (BOXLINE_API_KEY; PAGE_URL for your own page; a plan with shell sessions)
 *
 * Writes output/issues.json.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Boxline } from "@boxline/sdk";
import { chromium } from "playwright-core";

const out = process.env.OUTPUT_DIR ?? "output";
const url = process.env.PAGE_URL ?? "https://books.toscrape.com/";
const AXE = "https://cdn.jsdelivr.net/npm/axe-core@4.10.2/axe.min.js";
const bx = new Boxline();

interface Violation {
  id: string;
  impact: "critical" | "serious" | "moderate" | "minor";
  help: string;
  helpUrl: string;
  nodes: { target: string[] }[];
}

const session = await bx.sessions.create({ shell: true, timeout: 300, userMetadata: { example: "accessibility-check" } });
console.log(`Session: ${session.id}`);
const browser = await chromium.connectOverCDP(session.connectUrl!);
try {
  // 1. The shell downloads axe-core into the workspace; the files API hands its source to this script.
  const dl = await session.exec(`curl -sSfL --max-time 60 -o axe.min.js ${AXE}`);
  if (dl.exitCode !== 0) throw new Error(`could not download axe-core: ${dl.stderr.trim()}`);
  const axeSource = await session.files.readText("axe.min.js");

  // 2. The browser opens the page and runs the scan in it.
  const page = browser.contexts()[0]!.pages()[0]!;
  await page.goto(url, { waitUntil: "load" });
  await page.evaluate(axeSource);
  const violations = (await page.evaluate("axe.run().then((r) => r.violations)")) as Violation[];

  const order = { critical: 0, serious: 1, moderate: 2, minor: 3 };
  const issues = violations
    .map((v) => ({ id: v.id, impact: v.impact, count: v.nodes.length, help: v.help, helpUrl: v.helpUrl, where: v.nodes.slice(0, 5).map((n) => n.target.join(" ")) }))
    .sort((a, b) => order[a.impact] - order[b.impact]);
  console.log(`${issues.length} kinds of issue on ${page.url()}:`);
  for (const i of issues) console.log(`  ${i.impact.padEnd(8)} ${i.id} (${i.count}): ${i.help}`);

  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "issues.json"), JSON.stringify(issues, null, 2));
  writeFileSync(join(out, "result.json"), JSON.stringify({ url, axe: AXE, issues }, null, 2));
} finally {
  await session.stop();
  await browser.close().catch(() => undefined);
}
