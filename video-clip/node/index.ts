/**
 * Video clip: download a video you are allowed to download with yt-dlp in the session's shell, and cut its first 30
 * seconds with ffmpeg. The default is Big Buck Bunny (Blender Foundation, CC BY 3.0) from archive.org.
 *
 *   npx tsx node/index.ts            (BOXLINE_API_KEY; VIDEO_URL, CLIP_SECONDS; a plan with shell sessions)
 *
 * Only for videos you own, have the rights to, or that have an open licence. If the site refuses the download, the
 * example stops: it never disguises the downloader. Writes output/clip.mp4 and output/result.json.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Boxline } from "@boxline/sdk";

const out = process.env.OUTPUT_DIR ?? "output";
const video = process.env.VIDEO_URL ?? "https://archive.org/download/BigBuckBunny_328/BigBuckBunny_512kb.mp4";
const seconds = Number(process.env.CLIP_SECONDS ?? 30);
const bx = new Boxline();

const session = await bx.sessions.create({ browser: false, shell: true, timeout: 900, userMetadata: { example: "video-clip" } });
console.log(`Session: ${session.id}`);
try {
  const sh = async (command: string, timeoutMs = 300_000) => {
    const r = await session.exec(command, { env: { VIDEO_URL: video }, timeoutMs });
    if (r.exitCode !== 0) throw new Error(`${command.split(" ")[0]} failed: ${(r.stderr || r.stdout).trim().split("\n").slice(-3).join(" | ")}`);
    return r.stdout.trim();
  };
  await sh("pip install --quiet --disable-pip-version-check yt-dlp");
  // Only the first part is fetched (yt-dlp hands the range to ffmpeg), not the whole film.
  await sh(`mkdir -p downloads output && yt-dlp --quiet --no-progress --no-playlist --download-sections "*0-${seconds + 5}" -o "downloads/video.%(ext)s" "$VIDEO_URL"`, 600_000);
  const source = await sh("ls downloads/video.* | head -1");
  console.log(`Downloaded ${source}`);
  await sh(`ffmpeg -loglevel error -y -i "${source}" -t ${seconds} -c:v libx264 -preset veryfast -c:a aac -movflags +faststart output/clip.mp4`, 600_000);
  const duration = Number(await sh("ffprobe -v error -show_entries format=duration -of csv=p=0 output/clip.mp4"));

  const clip = await session.files.read("output/clip.mp4");
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "clip.mp4"), clip);
  console.log(`output/clip.mp4: ${duration.toFixed(1)} s, ${Math.round(clip.length / 1024)} KB`);
  writeFileSync(join(out, "result.json"), JSON.stringify({ video, seconds, source, duration, bytes: clip.length }, null, 2));
} finally {
  await session.stop();
}
