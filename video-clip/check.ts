import { bytes, check, expect, mp4Duration, result } from "../runner/check-lib.js";

check(() => {
  const r = result();
  const clip = bytes("clip.mp4");
  const local = mp4Duration(clip); // read from the file's own movie header, on this computer
  const want = r.seconds;
  expect(Math.abs(local - want) <= 1.5, `clip.mp4 lasts ${local.toFixed(1)} s, not about ${want} s`);
  expect(Math.abs(r.duration - local) < 0.5, `ffprobe in the session said ${r.duration} s, the file's header ${local.toFixed(2)} s`);
  expect(clip.length === r.bytes && clip.length > 100_000, `clip.mp4 is ${clip.length} bytes (the session reported ${r.bytes})`);
  return `clip.mp4: ${local.toFixed(1)} s (its MP4 header; ffprobe said ${Number(r.duration).toFixed(1)} s), ${Math.round(clip.length / 1024)} KB, cut from ${r.source}`;
});
