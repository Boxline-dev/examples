/**
 * Fill a form from a spreadsheet: read rows from a CSV with Python in the session's shell, and fill one form per row
 * with plain-English steps, pausing before the first submit so you can check it in the live view.
 *
 *   npx tsx node/index.ts            (BOXLINE_API_KEY; SHEET_URL: a CSV with name,phone,email columns; FORM_URL; ROWS)
 *
 * The rows' values go to the steps as %name%, %phone% and %email% variables: the model picks the fields, the values
 * are filled in on the server and never shown to it. Writes output/result.json with what the page said after each submit.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { Boxline } from "@boxline/sdk";

const out = process.env.OUTPUT_DIR ?? "output";
// A demo CSV served by httpbin.org (it decodes the base64 in the address): Ada Lovelace, Alan Turing, Grace Hopper.
const DEMO_SHEET =
  "https://httpbin.org/base64/bmFtZSxwaG9uZSxlbWFpbApBZGEgTG92ZWxhY2UsKzEgNTU1IDAxMDAsYWRhQGV4YW1wbGUuY29tCkFsYW4gVHVyaW5nLCsxIDU1NSAwMTAxLGFsYW5AZXhhbXBsZS5jb20KR3JhY2UgSG9wcGVyLCsxIDU1NSAwMTAyLGdyYWNlQGV4YW1wbGUuY29tCg==";
const sheetUrl = process.env.SHEET_URL ?? DEMO_SHEET;
const formUrl = process.env.FORM_URL ?? "https://httpbin.org/forms/post";
const maxRows = Number(process.env.ROWS ?? 3);
const bx = new Boxline();

const session = await bx.sessions.create({ shell: true, keepAlive: true, timeout: 900, userMetadata: { example: "form-from-spreadsheet" } });
console.log(`Session: ${session.id}`);
const rl = createInterface({ input: process.stdin, output: process.stdout });
try {
  // 1. The shell: download the sheet and read it with Python's csv module.
  const r = await session.exec(
    `mkdir -p data && curl -sSfL --max-time 60 -o data/sheet.csv "$SHEET_URL" && python3 -c 'import csv, json; print(json.dumps(list(csv.DictReader(open("data/sheet.csv")))))'`,
    { env: { SHEET_URL: sheetUrl } },
  );
  if (r.exitCode !== 0) throw new Error(`could not read the sheet: ${r.stderr.trim()}`);
  const rows = (JSON.parse(r.stdout) as { name: string; phone: string; email: string }[]).slice(0, maxRows);
  console.log(`${rows.length} rows to fill from the sheet`);

  // 2. One form per row: plain-English steps pick the fields; the values stay out of the model's sight.
  const submitted: { name: string; pageSays: string }[] = [];
  let modelUsd = 0;
  for (const [i, row] of rows.entries()) {
    await session.goto(formUrl);
    const steps = await session.actions([
      { action: "step", instruction: "type %name% into the customer name field", variables: { name: row.name } },
      { action: "step", instruction: "type %phone% into the telephone field", variables: { phone: row.phone } },
      { action: "step", instruction: "type %email% into the email address field", variables: { email: row.email } },
    ]);
    const failed = steps.find((s) => !s.ok);
    if (failed) throw new Error(`a step failed: ${failed.error}`);
    modelUsd += steps.reduce((a, s) => a + ((s.value as { usage?: { costUsd: number } })?.usage?.costUsd ?? 0), 0);
    if (i === 0) {
      console.log(`\nRow 1 is filled in. Check it in the live view (the link works like a password):\n  ${session.liveUrl}`);
      await rl.question("Check the first row in the live view, then press Enter to submit it: ");
    }
    await session.click("form button, form [type=submit]");
    await session.wait(1000);
    const { content } = await session.content("text");
    submitted.push({ name: row.name, pageSays: content.slice(0, 600) });
    console.log(`Row ${i + 1} (${row.name}) submitted: ${content.replace(/\s+/g, " ").slice(0, 100)}`);
  }

  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "result.json"), JSON.stringify({ sheetUrl, formUrl, rows: submitted, reviewed: true, usage: { modelUsd } }, null, 2));
} finally {
  rl.close();
  await session.release();
}
