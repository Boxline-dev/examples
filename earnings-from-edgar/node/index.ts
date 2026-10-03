/**
 * Earnings from EDGAR: yearly revenue, net income and diluted EPS of a few companies from SEC EDGAR's official
 * companyfacts API, with growth and margins worked out in a session's shell (Python), a CSV, a chart and a summary.
 * The numbers are the ones the companies filed; no model reads or writes them.
 *
 *   npx tsx node/index.ts            (BOXLINE_API_KEY; TICKERS; SEC_USER_AGENT; a plan with shell sessions)
 *
 * Writes output/earnings.csv, output/chart.png, output/summary.md and output/result.json.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Boxline } from "@boxline/sdk";

const here = dirname(fileURLToPath(import.meta.url));
const out = process.env.OUTPUT_DIR ?? "output";
const userAgent = process.env.SEC_USER_AGENT;
if (!userAgent?.includes("@")) {
  console.error('Set SEC_USER_AGENT to your name and email, e.g. "Jane Doe jane@example.com": SEC asks every automated client to declare one.');
  process.exit(1);
}
const env: Record<string, string> = { TICKERS: process.env.TICKERS ?? "AAPL,MSFT,NVDA", SEC_USER_AGENT: userAgent, YEARS: process.env.YEARS ?? "4" };
for (const name of ["EDGAR_DATA_URL", "EDGAR_TICKERS_URL"]) if (process.env[name]) env[name] = process.env[name]!;
const bx = new Boxline();

const session = await bx.sessions.create({ browser: false, shell: true, timeout: 300, userMetadata: { example: "earnings-from-edgar" } });
console.log(`Session: ${session.id}`);
try {
  await session.files.write("edgar.py", readFileSync(join(here, "../edgar.py")));
  const r = await session.exec("python3 edgar.py", { env, timeoutMs: 180_000 });
  if (r.exitCode !== 0) throw new Error(`edgar.py failed: ${r.stderr.trim().split("\n").at(-1)}`);
  const result = JSON.parse(r.stdout);

  mkdirSync(out, { recursive: true });
  for (const name of ["earnings.csv", "chart.png", "summary.md"]) writeFileSync(join(out, name), await session.files.read(name));
  for (const c of result.companies) {
    const last = c.years.at(-1);
    const growth = last.revenueGrowthPct === undefined ? "" : ` (${last.revenueGrowthPct > 0 ? "+" : ""}${last.revenueGrowthPct}%)`;
    console.log(`${c.ticker}, year to ${last.end}: revenue $${(last.revenue / 1e6).toFixed(1)}M${growth}, net margin ${last.netMarginPct}%, EPS ${last.eps}  [${c.revenueConcept}]`);
  }
  console.log(`${result.requests} requests to EDGAR; output/summary.md, output/earnings.csv, output/chart.png`);
  writeFileSync(join(out, "result.json"), JSON.stringify({ tickers: env.TICKERS.split(","), ...result }, null, 2));
} finally {
  await session.release();
}
