/**
 * Article to speech: turn a web article into an MP3 you can listen to. The article's own paragraphs are taken from the
 * page (menus, captions and footers left out) and checked word for word against it, then spoken offline in a
 * session's shell (espeak-ng, installed by the session's setup) and encoded with ffmpeg. No speech API key needed.
 *
 *   npx tsx node/index.ts            (BOXLINE_API_KEY; ARTICLE_URL, MAX_WORDS, VOICE, SPEED; a plan with shell sessions)
 *
 * Writes output/article.mp3, output/article.txt and output/result.json.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Boxline } from "@boxline/sdk";

const out = process.env.OUTPUT_DIR ?? "output";
const url = process.env.ARTICLE_URL ?? "https://en.wikipedia.org/wiki/Urban_forest";
const maxWords = Number(process.env.MAX_WORDS ?? 250);
const voice = process.env.VOICE ?? "en-us";
const speed = Number(process.env.SPEED ?? 165); // words per minute
const bx = new Boxline();
const norm = (s: string) => s.toLowerCase().replace(/\[\d+\]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

// 1. The article's own paragraphs, word for word, and the page's text to check them against.
const [r, page] = await Promise.all([
  bx.extract<{ title: string; paragraphs: string[] }>({
    url,
    prompt: `The article on this page: its title, and its paragraphs copied word for word, in order, without menus, captions, footnotes, footers or ads. Stop after about ${maxWords} words, at the end of a paragraph.`,
    schema: { type: "object", properties: { title: { type: "string" }, paragraphs: { type: "array", items: { type: "string" } } }, required: ["title", "paragraphs"] },
  }),
  bx.fetch(url, { format: "text" }),
]);
const pageText = norm(page.content);
// A paragraph that is not on the page as written (the model rewrote it) is not read out.
const paragraphs = r.data.paragraphs.filter((p) => pageText.includes(norm(p).slice(0, 120)));
const text = [r.data.title, ...paragraphs].join("\n\n");
const words = text.split(/\s+/).filter(Boolean).length;
console.log(`"${r.data.title}": ${paragraphs.length} of ${r.data.paragraphs.length} paragraphs match the page word for word; ${words} words`);
if (!paragraphs.length) throw new Error("no paragraph could be checked against the page");

// 2. Speech, made in the machine.
const session = await bx.sessions.create({ browser: false, shell: true, setup: ["sudo DEBIAN_FRONTEND=noninteractive apt-get update -qq && sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends espeak-ng >/dev/null"], timeout: 600, idleTimeout: 300, userMetadata: { example: "article-to-speech" } });
console.log(`Session: ${session.id}`);
let durationSeconds = 0;
try {
  await session.files.write("article.txt", text);
  const sh = await session.exec(
    'espeak-ng -v "$VOICE" -s "$SPEED" -f article.txt -w article.wav && ffmpeg -loglevel error -y -i article.wav -metadata title="$TITLE" -codec:a libmp3lame -qscale:a 5 article.mp3 && ffprobe -v error -show_entries format=duration -of csv=p=0 article.mp3',
    { env: { VOICE: voice, SPEED: String(speed), TITLE: r.data.title }, timeoutMs: 300_000 },
  );
  if (sh.exitCode !== 0) throw new Error(`speech failed: ${sh.stderr.trim()}`);
  durationSeconds = Math.round(Number(sh.stdout.trim()) * 10) / 10;
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "article.mp3"), await session.files.read("article.mp3"));
  writeFileSync(join(out, "article.txt"), text);
} finally {
  await session.stop();
}
console.log(`article.mp3: ${durationSeconds} s (${voice}, ${speed} words per minute)`);
writeFileSync(join(out, "result.json"), JSON.stringify({ url, title: r.data.title, paragraphs, dropped: r.data.paragraphs.length - paragraphs.length, words, voice, speed, durationSeconds, usage: { modelUsd: r.usage.costUsd } }, null, 2));
