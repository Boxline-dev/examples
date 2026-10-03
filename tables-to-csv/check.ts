import { readFileSync } from "node:fs";
import { check, expect, file, result, site } from "../runner/check-lib.js";

/** A CSV file as rows (RFC 4180: quoted fields, doubled quotes, commas and newlines inside quotes). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') (field += '"'), i++;
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") row.push(field), (field = "");
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field), rows.push(row), (row = []), (field = "");
    } else field += ch;
  }
  if (field || row.length) row.push(field), rows.push(row);
  return rows;
}

check(() => {
  const r = result();
  expect(r.tables.length >= 1, "no table was written");
  // Every CSV, read back here: its header and row count match what the browser saw on the page.
  const csvs = r.tables.map((t: any) => {
    const rows = parseCsv(readFileSync(file(t.csv), "utf8"));
    expect(JSON.stringify(rows[0]) === JSON.stringify(t.headers), `${t.csv}: the header is not the page's`);
    expect(rows.length - 1 === t.domDataRows && t.rows === t.domDataRows, `${t.csv}: ${rows.length - 1} rows, the page has ${t.domDataRows}`);
    expect(rows.every((row) => row.length === t.headers.length), `${t.csv}: rows of different widths`);
    return rows;
  });
  const standIn = site();
  if (!standIn) {
    const biggest = r.tables.reduce((a: any, t: any) => (t.rows > a.rows ? t : a));
    expect(biggest.rows >= 5, `the biggest table has only ${biggest.rows} rows`);
    return `${r.tables.length} tables from "${r.title}"; the biggest ${biggest.rows} rows × ${biggest.columns} columns; every CSV matches the page's rows and header`;
  }

  // The stand-in's two tables, cell for cell: merged cells filled in, footnote marks left out, numbers summed exactly.
  const want = standIn.expected.tables;
  for (const [i, key] of [[0, "lighthouses"], [1, "cities"]] as const) {
    const t = want[key];
    expect(r.tables[i].caption === t.caption, `table ${i + 1}'s caption is "${r.tables[i].caption}"`);
    expect(JSON.stringify(csvs[i]) === JSON.stringify([t.headers, ...t.rows]), `table ${i + 1} differs from the page: ${JSON.stringify(csvs[i])}`);
  }
  const num = (i: number, col: string) => r.tables[i].numeric.find((n: any) => n.column === col);
  expect(num(0, "Height (m)")?.sum === want.lighthouses.heightSum, `the heights add up to ${num(0, "Height (m)")?.sum}, not ${want.lighthouses.heightSum}`);
  expect(num(1, "Population")?.sum === want.cities.populationSum, `the populations add up to ${num(1, "Population")?.sum}, not ${want.cities.populationSum}`);
  expect(num(1, "Area (km²)")?.mean === want.cities.areaMean, `the mean area is ${num(1, "Area (km²)")?.mean}, not ${want.cities.areaMean}`);
  expect(!num(0, "Lighthouse / Country"), "a text column was taken for a number");
  return `2 tables cell for cell (two-row header joined, "Italy" filled down from the rowspan, footnote marks gone); heights sum ${want.lighthouses.heightSum}, population ${want.cities.populationSum.toLocaleString("en")}, mean area ${want.cities.areaMean}`;
});
