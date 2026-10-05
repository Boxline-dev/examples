/**
 * Screenshots to a PDF report: screenshot several pages in the session's browser, then combine them into one PDF with
 * Python (Pillow) in the session's shell.
 *
 *   npx tsx node/index.ts            (BOXLINE_API_KEY; URLS: comma-separated pages; a plan with shell sessions)
 *
 * Writes output/shot-N.png and output/report.pdf.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Boxline } from "@boxline/sdk";

const out = process.env.OUTPUT_DIR ?? "output";
const urls = (process.env.URLS ?? "https://books.toscrape.com/,https://quotes.toscrape.com/,https://httpbin.org/").split(",").map((u) => u.trim()).filter(Boolean);
const bx = new Boxline();

const session = await bx.sessions.create({ shell: true, timeout: 600, userMetadata: { example: "screenshots-to-pdf" } });
console.log(`Session: ${session.id}`);
try {
  mkdirSync(out, { recursive: true });
  const shots: string[] = [];
  const pages: { url: string; title: string; file: string }[] = [];
  for (const [i, url] of urls.entries()) {
    // The actions API: open the page and screenshot it (base64 PNG), then keep it in the workspace for the shell.
    const { title } = await session.goto(url);
    const shot = await session.screenshot();
    const png = Buffer.from(shot.data, "base64");
    const file = `output/shot-${i + 1}.png`;
    await session.files.write(file, png);
    writeFileSync(join(out, `shot-${i + 1}.png`), png);
    shots.push(file);
    pages.push({ url, title, file });
    console.log(`Saved ${file}: ${title}`);
  }

  await session.files.write("combine.py", readFileSync(new URL("../combine.py", import.meta.url)));
  const r = await session.exec(`python3 combine.py ${shots.join(" ")}`);
  if (r.exitCode !== 0) throw new Error(`Pillow failed: ${r.stderr.trim()}`);
  const pdf = await session.files.read("output/report.pdf");
  writeFileSync(join(out, "report.pdf"), pdf);
  console.log(`output/report.pdf: ${r.stdout.trim()} pages, ${Math.round(pdf.length / 1024)} KB`);
  writeFileSync(join(out, "result.json"), JSON.stringify({ pages, pdfPages: Number(r.stdout.trim()), pdfBytes: pdf.length }, null, 2));
} finally {
  await session.stop();
}
