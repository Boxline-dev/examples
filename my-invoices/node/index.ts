/**
 * My invoices: open your billing page signed in with a saved login and download the invoices of the last 3 months.
 *
 *   BILLING_URL=https://… CONTEXT_ID=… npx tsx node/index.ts     (BOXLINE_API_KEY; MONTHS, default 3)
 *
 * CONTEXT_ID is a saved login that is signed in to the site (make one with the "save-a-login" example). The browser
 * downloads each invoice into the session's downloads/ folder; the files API copies them to output/invoices/.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Boxline, type Session } from "@boxline/sdk";
import { chromium } from "playwright-core";

const out = process.env.OUTPUT_DIR ?? "output";
const billing = process.env.BILLING_URL;
const contextId = process.env.CONTEXT_ID;
const months = Number(process.env.MONTHS ?? 3);
if (!billing || !contextId) throw new Error("Set BILLING_URL (your billing page) and CONTEXT_ID (a saved login signed in to that site)");
const bx = new Boxline();

// The first day of the month `months - 1` months ago: "the last 3 months" is this month and the two before.
const now = new Date();
const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1)).toISOString().slice(0, 10);

/** The files in downloads/ (none before the first download: the folder does not exist yet). */
const downloads = (session: Session) => session.files.list("downloads").then((l) => l.entries, () => []);

/** Waits for a new, finished file in downloads/ (one that was not there before the click). */
async function newDownload(session: Session, before: Set<string>, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < deadline) {
    const entries = await downloads(session);
    const fresh = entries.find((e) => e.type === "file" && !before.has(e.name) && !e.name.endsWith(".crdownload"));
    if (fresh && `${fresh.name}:${fresh.size}` === last) return fresh; // the same size twice: it has finished writing
    last = fresh ? `${fresh.name}:${fresh.size}` : "";
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("the download did not arrive");
}

const session = await bx.sessions.create({ shell: false, timeout: 600, context: { id: contextId }, userMetadata: { example: "my-invoices" } });
console.log(`Session: ${session.id}`);
const browser = await chromium.connectOverCDP(session.connectUrl!);
try {
  const page = browser.contexts()[0]!.pages()[0]!;
  await page.goto(billing);
  if (/log.?in|sign.?in/i.test(page.url())) throw new Error(`the saved login is not signed in (the site sent the browser to ${page.url()}): run save-a-login again`);

  // The billing table: each row's cells and its PDF link; the date is the first cell that reads as YYYY-MM-DD.
  const rows = await page.$$eval("tr", (trs) =>
    trs.map((tr) => ({ cells: [...tr.querySelectorAll("td")].map((td) => td.textContent!.trim()), pdf: (tr.querySelector('a[href$=".pdf"], a[href*=".pdf?"]') as HTMLAnchorElement | null)?.href ?? null })),
  );
  const recent = rows
    .map((r) => ({ ...r, date: r.cells.find((c) => /^\d{4}-\d{2}-\d{2}$/.test(c)) ?? "" }))
    .filter((r) => r.pdf && r.date >= since);
  console.log(`${recent.length} invoices since ${since} on ${page.url()}`);

  mkdirSync(join(out, "invoices"), { recursive: true });
  const invoices: { id: string; date: string; amount: string | null; file: string; bytes: number }[] = [];
  for (const row of recent) {
    const before = new Set((await downloads(session)).map((e) => e.name));
    await page.click(`a[href="${new URL(row.pdf!).pathname}"]`);
    const file = await newDownload(session, before);
    const data = await session.files.read(`downloads/${file.name}`);
    writeFileSync(join(out, "invoices", file.name), data);
    const amount = row.cells.find((c) => /[€$£]\s?\d|\d\s?(EUR|USD|GBP)/.test(c)) ?? null;
    invoices.push({ id: row.cells[0]!, date: row.date, amount, file: `invoices/${file.name}`, bytes: data.length });
    console.log(`  ${row.date}  ${amount ?? ""}  → output/invoices/${file.name} (${data.length} bytes)`);
  }
  writeFileSync(join(out, "result.json"), JSON.stringify({ billingUrl: billing, months, since, invoices }, null, 2));
} finally {
  await session.release();
  await browser.close().catch(() => undefined);
}
