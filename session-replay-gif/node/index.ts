/**
 * Session replay as a GIF: a short browse in one session, then that session's own recording (one JPEG frame per screen
 * change) turned into an MP4 and a GIF with ffmpeg in a second, shell-only session. The frames keep the timing they
 * had (long idle stretches shortened), so the clip plays back what happened.
 *
 *   npx tsx node/index.ts            (BOXLINE_API_KEY; START_URL; a plan with shell sessions)
 *
 * Writes output/replay.mp4, output/replay.gif, output/frames/ and output/result.json.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Boxline } from "@boxline/sdk";

const here = dirname(fileURLToPath(import.meta.url));
const out = process.env.OUTPUT_DIR ?? "output";
const start = process.env.START_URL ?? "https://books.toscrape.com/";
const bx = new Boxline();

// 1. The browse to record: the shop, a category, a book, and back.
const browse = await bx.sessions.create({ timeout: 300, userMetadata: { example: "session-replay-gif" } });
console.log(`Session: ${browse.id} (the browse)`);
try {
  await browse.goto(start);
  await browse.click('a[href*="category/books/travel_2"]');
  await browse.click("article.product_pod h3 a");
  await browse.back();
} finally {
  await browse.release(); // the recording keeps a last frame on release
}

// 2. Its recording: the frames and when each was taken.
const rec = await bx.sessions.recording(browse.id);
if (rec.frames.length < 2) throw new Error(`the recording has ${rec.frames.length} frames`);
mkdirSync(join(out, "frames"), { recursive: true });
const t0 = Date.parse(rec.frames[0]!.at);
const frames = [];
for (const [i, f] of rec.frames.entries()) {
  const jpg = await bx.sessions.recordingFrame(browse.id, f.index);
  const file = `frames/${String(i).padStart(3, "0")}.jpg`;
  writeFileSync(join(out, file), jpg);
  frames.push({ file, t: (Date.parse(f.at) - t0) / 1000, url: f.url });
}
console.log(`${frames.length} frames over ${(frames.at(-1)!.t).toFixed(1)} s: ${[...new Set(frames.map((f) => f.url).filter(Boolean))].join(" → ")}`);

// 3. The clip, made in a shell-only session with ffmpeg; the files go in and come back through the files API.
const shell = await bx.sessions.create({ browser: false, shell: true, timeout: 600, userMetadata: { example: "session-replay-gif" } });
console.log(`Session: ${shell.id} (ffmpeg)`);
try {
  for (const f of frames) await shell.files.write(f.file, readFileSync(join(out, f.file)));
  await shell.files.write("frames.json", JSON.stringify(frames));
  await shell.files.write("make_replay.py", readFileSync(join(here, "../make_replay.py")));
  const r = await shell.exec("python3 make_replay.py", { timeoutMs: 300_000 });
  if (r.exitCode !== 0) throw new Error(`make_replay.py failed: ${r.stderr.trim()}`);
  const made = JSON.parse(r.stdout);
  writeFileSync(join(out, "replay.mp4"), await shell.files.read("replay.mp4"));
  writeFileSync(join(out, "replay.gif"), await shell.files.read("replay.gif"));
  console.log(`replay.mp4: ${made.mp4.seconds} s, ${made.mp4.width}×${made.mp4.height}; replay.gif: ${made.gif.frames} frames`);
  writeFileSync(
    join(out, "result.json"),
    JSON.stringify({ start, sessionId: browse.id, recordingMs: rec.durationMs, ...made, frames }, null, 2),
  );
} finally {
  await shell.release();
}
