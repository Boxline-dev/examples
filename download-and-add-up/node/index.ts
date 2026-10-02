/**
 * Download and add up: the browser downloads a CSV report, Python in the shell adds up its revenue column and saves
 * the total, and the browser types the total into a form. One session: browser, shell and files share /workspace.
 *
 *   npx tsx node/index.ts            (BOXLINE_API_KEY; REPORT_PAGE_URL: a page with a CSV link, FORM_URL; a shell plan)
 *
 * Without REPORT_PAGE_URL a demo report page is made in the browser. Writes output/report.csv, output/total.txt and
 * output/result.json (with what the form page said back).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Boxline } from "@boxline/sdk";
import { chromium } from "playwright-core";

const out = process.env.OUTPUT_DIR ?? "output";
const reportPage = process.env.REPORT_PAGE_URL;
const formUrl = process.env.FORM_URL ?? "https://httpbin.org/forms/post";
const bx = new Boxline();

const session = await bx.sessions.create({ shell: true, timeout: 600, userMetadata: { example: "download-and-add-up" } });
console.log(`Session: ${session.id}`);
const browser = await chromium.connectOverCDP(session.connectUrl!);
try {
  // 1. The browser downloads the report; downloads land in the workspace's downloads/ folder.
  const page = browser.contexts()[0]!.pages()[0]!;
  if (reportPage) await page.goto(reportPage);
  else {
    const csv = "month,revenue\nJan,1200\nFeb,1850\nMar,2410\n";
    await page.setContent(`<h1>Quarterly report</h1><a download="report.csv" href="data:text/csv,${encodeURIComponent(csv)}">Download report</a>`);
  }
  await page.getByRole("link", { name: /download/i }).first().click();
  const file = await session.files.waitFor("downloads/*.csv", 30_000); // waits until it has finished writing
  console.log(`Downloaded ${file.path} (${file.size} bytes)`);

  // 2. The shell: Python adds up the revenue column and writes the total.
  const py = await session.exec(`mkdir -p output && python3 - "${file.path}" <<'PY'
import csv, sys
total = sum(float(row["revenue"]) for row in csv.DictReader(open(sys.argv[1])))
open("output/total.txt", "w").write(f"{total:g}")
print(f"total revenue: {total:g}")
PY`);
  if (py.exitCode !== 0) throw new Error(`Python failed: ${py.stderr}`);
  const total = (await session.files.readText("output/total.txt")).trim(); // the files API reads what the shell wrote
  console.log(py.stdout.trim());

  // 3. The browser types the total into the form's first text box and submits it.
  await page.goto(formUrl);
  await page.locator("form input:not([type]), form input[type=text]").first().fill(total);
  await Promise.all([page.waitForURL((u) => u.href !== formUrl), page.locator("form button, form [type=submit]").first().click()]);
  const pageSays = (await page.locator("body").innerText()).trim().slice(0, 1000);
  console.log(`The form page says: ${pageSays.replace(/\s+/g, " ").slice(0, 160)}`);

  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "report.csv"), await session.files.read(file.path));
  writeFileSync(join(out, "total.txt"), total + "\n");
  writeFileSync(join(out, "result.json"), JSON.stringify({ report: file.path, total, form: formUrl, pageSays }, null, 2));
} finally {
  await session.release();
  await browser.close().catch(() => undefined);
}
