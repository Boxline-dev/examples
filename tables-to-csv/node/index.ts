/**
 * Tables to CSV: every data table on a page, read in a real browser (merged cells filled in, footnote marks left
 * out), written as CSV files, with each numeric column's count, sum, min, max and mean computed in the session's
 * shell. No model: what is in the CSV is what is on the page.
 *
 *   npx tsx node/index.ts            (BOXLINE_API_KEY; PAGE_URL; a plan with shell sessions)
 *
 * Writes output/tables/table-N.csv, output/summary.md and output/result.json.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Boxline } from "@boxline/sdk";

interface Table {
  index: number;
  caption: string;
  headers: string[];
  rows: string[][];
  headerRows: number;
  domDataRows: number;
}
interface Summary {
  index: number;
  caption: string;
  csv: string;
  rows: number;
  columns: number;
  numeric: { column: string; count: number; sum: number; min: number; max: number; mean: number }[];
}

const here = dirname(fileURLToPath(import.meta.url));
const out = process.env.OUTPUT_DIR ?? "output";
const url = process.env.PAGE_URL ?? "https://en.wikipedia.org/wiki/List_of_largest_cities";
const bx = new Boxline();

const session = await bx.sessions.create({ shell: true, timeout: 600, userMetadata: { example: "tables-to-csv" } });
console.log(`Session: ${session.id}`);
try {
  // 1. The tables, as the browser shows them: tables.js expands rowspan and colspan into a full grid.
  const page = await session.goto(url);
  const tables = await session.evaluate<Table[]>(readFileSync(join(here, "../tables.js"), "utf8"));
  console.log(`${page.title}: ${tables.length} tables`);
  if (!tables.length) throw new Error("no data table on this page");

  // 2. CSV files and the numbers, in the shell (Python's csv module; no model reads the data).
  await session.files.write("tables.json", JSON.stringify(tables));
  await session.files.write("to_csv.py", readFileSync(join(here, "../to_csv.py")));
  const r = await session.exec("python3 to_csv.py");
  if (r.exitCode !== 0) throw new Error(`to_csv.py failed: ${r.stderr.trim()}`);
  const summary = JSON.parse(r.stdout) as Summary[];

  mkdirSync(join(out, "tables"), { recursive: true });
  const md = [`# Tables on ${page.title}`, "", url, ""];
  for (const t of summary) {
    writeFileSync(join(out, t.csv), await session.files.read(t.csv));
    console.log(`  ${t.csv}: ${t.rows} rows × ${t.columns} columns${t.caption ? ` (${t.caption})` : ""}`);
    md.push(`## Table ${t.index}${t.caption ? `: ${t.caption}` : ""}`, "", `${t.rows} rows, ${t.columns} columns: \`${t.csv}\``, "");
    if (t.numeric.length) {
      md.push("| Column | Count | Sum | Min | Max | Mean |", "|---|---|---|---|---|---|");
      for (const n of t.numeric) md.push(`| ${n.column} | ${n.count} | ${n.sum} | ${n.min} | ${n.max} | ${n.mean} |`);
      md.push("");
    }
  }
  writeFileSync(join(out, "summary.md"), `${md.join("\n")}\n`);
  writeFileSync(
    join(out, "result.json"),
    JSON.stringify({ url, title: page.title, tables: summary.map((t) => ({ ...t, headers: tables[t.index - 1]!.headers, domDataRows: tables[t.index - 1]!.domDataRows })) }, null, 2),
  );
} finally {
  await session.release();
}
