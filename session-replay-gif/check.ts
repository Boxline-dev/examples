import { bytes, check, expect, mp4Duration, result } from "../runner/check-lib.js";

check(() => {
  const r = result();
  // The recording followed the browse: the start page, the Travel category, a book.
  expect(r.frames.length >= 3, `only ${r.frames.length} frames were recorded`);
  const urls: string[] = r.frames.map((f: any) => f.url ?? "");
  expect(urls.some((u) => u.includes("category/books/travel_2")), "no frame of the Travel category");
  expect(urls.some((u) => /\/catalogue\/(?!category\/)[^/]+\/index\.html/.test(u)), "no frame of a book's page");
  expect(r.frames.every((f: any, i: number) => i === 0 || f.t >= r.frames[i - 1].t), "the frames are out of order");

  // The clip: a real MP4 and GIF, as long as the frames' timing says.
  const mp4 = bytes("replay.mp4");
  expect(mp4.subarray(4, 8).toString("latin1") === "ftyp", "replay.mp4 is not an MP4");
  const seconds = mp4Duration(mp4);
  expect(Math.abs(seconds - r.plannedSeconds) <= 0.5, `replay.mp4 lasts ${seconds.toFixed(2)} s, the frames add up to ${r.plannedSeconds} s`);
  const gif = bytes("replay.gif");
  expect(gif.subarray(0, 6).toString("latin1") === "GIF89a", "replay.gif is not a GIF");
  expect(r.gif.frames >= r.frames.length, `the GIF has ${r.gif.frames} frames for ${r.frames.length} screens`);
  expect(r.mp4.width === 1280 && r.gif.width === 800, `sizes ${r.mp4.width} and ${r.gif.width}`);
  const pages = new Set(urls.filter(Boolean)).size;
  return `${r.frames.length} recorded screens of ${pages} pages (the shop, Travel, a book) became a ${seconds.toFixed(1)} s MP4 (${(mp4.length / 1024).toFixed(0)} KB) and a ${r.gif.frames}-frame GIF (${(gif.length / 1024).toFixed(0)} KB)`;
});
