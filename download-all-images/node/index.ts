/**
 * Download all images: the browser finds every image on a page, the shell downloads them into the workspace with the
 * browser's cookies and zips them, and the files API brings the zip back.
 *
 *   npx tsx node/index.ts            (BOXLINE_API_KEY; PAGE_URL for another page; a plan with shell sessions)
 *
 * Writes output/images.zip and output/result.json.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Boxline } from "@boxline/sdk";
import { chromium } from "playwright-core";

const out = process.env.OUTPUT_DIR ?? "output";
const url = process.env.PAGE_URL ?? "https://books.toscrape.com/";
const bx = new Boxline();

const session = await bx.sessions.create({ shell: true, timeout: 600, userMetadata: { example: "download-all-images" } });
console.log(`Session: ${session.id}`);
const browser = await chromium.connectOverCDP(session.connectUrl!);
try {
  // 1. The browser: every image the page shows, as absolute addresses.
  const page = browser.contexts()[0]!.pages()[0]!;
  await page.goto(url, { waitUntil: "load" });
  const srcs = await page.$$eval("img", (imgs) => imgs.map((i) => (i as HTMLImageElement).currentSrc || (i as HTMLImageElement).src));
  const images = [...new Set(srcs)].filter((s) => /^https?:\/\//.test(s)).slice(0, 100);
  console.log(`${images.length} images on ${page.url()}`);

  // 2. The shell: download them with the browser's cookies (so images behind a sign-in work too), then zip them.
  await session.exportCookies("cookies.txt");
  await session.files.write("images.txt", images.join("\n") + "\n");
  await session.files.write("download.sh", readFileSync(new URL("../download.sh", import.meta.url)));
  const r = await session.exec("bash download.sh", { timeoutMs: 300_000 });
  if (r.exitCode !== 0) throw new Error(`the download failed: ${r.stderr.trim()}`);
  if (r.stderr.trim()) console.log(r.stderr.trim());
  const saved = Number(r.stdout.trim());

  // 3. The files API: the zip, back on this computer.
  const zip = await session.files.read("output/images.zip");
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "images.zip"), zip);
  console.log(`${saved} images saved in the workspace's output/images; output/images.zip (${Math.round(zip.length / 1024)} KB) is here`);
  writeFileSync(join(out, "result.json"), JSON.stringify({ page: url, found: images.length, saved, zipBytes: zip.length, images }, null, 2));
} finally {
  await session.release();
  await browser.close().catch(() => undefined);
}
