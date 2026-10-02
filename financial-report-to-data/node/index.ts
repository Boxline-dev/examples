/**
 * Financial report to data: find a company's latest quarterly report on its investor page, download the PDF in the
 * session's shell, turn it into text with pdftotext, and have a model pull out the key figures as JSON.
 *
 *   INVESTOR_URL=https://… npx tsx node/index.ts     (BOXLINE_API_KEY; a plan with shell sessions)
 *
 * Writes output/report.txt and output/figures.json.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Boxline } from "@boxline/sdk";

const out = process.env.OUTPUT_DIR ?? "output";
const investorUrl = process.env.INVESTOR_URL;
if (!investorUrl) throw new Error("Set INVESTOR_URL to the company's investor relations page (the one that lists its reports)");
const bx = new Boxline();

interface Figures {
  company: string;
  period: string;
  currency: string;
  revenueMillions: number;
  netIncomeMillions: number;
  dilutedEps: number | null;
  cashMillions: number | null;
}

const session = await bx.sessions.create({ shell: true, timeout: 600, userMetadata: { example: "financial-report-to-data" } });
console.log(`Session: ${session.id}`);
try {
  // 1. The browser: the investor page's PDF links; the latest quarter is the highest "Qn YYYY" (in any order).
  await session.goto(investorUrl);
  const links = await session.evaluate<{ text: string; href: string }[]>(
    `[...document.querySelectorAll("a[href]")].map((a) => ({ text: a.textContent.trim(), href: a.href }))`,
  );
  const quarterOf = (l: { text: string; href: string }) => {
    const s = `${l.text} ${l.href}`;
    const m = /\bQ([1-4])\W{0,3}((?:19|20)\d\d)\b/i.exec(s) ?? /\b((?:19|20)\d\d)\W{0,3}Q([1-4])\b/i.exec(s);
    if (!m) return 0;
    return /^Q/i.test(m[0]) ? Number(m[2]) * 10 + Number(m[1]) : Number(m[1]) * 10 + Number(m[2]);
  };
  const reports = links.filter((l) => /\.pdf(\?|$)/i.test(l.href) && quarterOf(l) > 0).sort((a, b) => quarterOf(b) - quarterOf(a));
  if (!reports.length) throw new Error(`no quarterly report PDF linked from ${investorUrl}`);
  const latest = reports[0]!;
  console.log(`Latest quarterly report: ${latest.text} (${latest.href})`);

  // 2. The shell: download it with the browser's cookies, then pdftotext.
  await session.exportCookies("cookies.txt");
  const r = await session.exec(
    'mkdir -p downloads output && curl -sSfL --max-time 120 -b cookies.txt -o downloads/report.pdf "$REPORT_URL" && pdftotext -layout downloads/report.pdf output/report.txt',
    { env: { REPORT_URL: latest.href }, timeoutMs: 300_000 },
  );
  if (r.exitCode !== 0) throw new Error(`the download or pdftotext failed: ${r.stderr.trim()}`);
  const text = await session.files.readText("output/report.txt");

  // 3. A model reads the text (shown in the session's browser) into a fixed shape.
  await session.evaluate(`document.title = "report.txt"; document.body.innerHTML = "<pre></pre>"; document.querySelector("pre").textContent = ${JSON.stringify(text.slice(0, 40_000))}; true`);
  const { data, model, usage } = await session.extract<Figures>("The key figures of this quarterly report.", {
    schema: {
      type: "object",
      properties: {
        company: { type: "string" },
        period: { type: "string", description: 'the quarter, written like "Q3 2026"' },
        currency: { type: "string", description: "ISO 4217 code, e.g. USD" },
        revenueMillions: { type: "number", description: "revenue for the quarter, in millions" },
        netIncomeMillions: { type: "number", description: "net income (profit) for the quarter, in millions" },
        dilutedEps: { type: ["number", "null"], description: "diluted earnings per share" },
        cashMillions: { type: ["number", "null"], description: "cash and cash equivalents at the end of the quarter, in millions" },
      },
      required: ["company", "period", "currency", "revenueMillions", "netIncomeMillions", "dilutedEps", "cashMillions"],
    },
  });
  console.log(`${data.company}, ${data.period}: revenue ${data.revenueMillions} m ${data.currency}, net income ${data.netIncomeMillions} m, diluted EPS ${data.dilutedEps}, cash ${data.cashMillions} m`);

  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "report.txt"), text);
  writeFileSync(join(out, "figures.json"), JSON.stringify(data, null, 2));
  writeFileSync(join(out, "result.json"), JSON.stringify({ investorUrl, report: latest, figures: data, model, usage: { modelUsd: usage.costUsd } }, null, 2));
} finally {
  await session.release();
}
