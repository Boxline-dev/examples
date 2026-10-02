import { bytes, check, expect, isPng, result, sha256, site, unzip } from "../runner/check-lib.js";

check(() => {
  const r = result();
  const files = unzip(bytes("images.zip"));
  expect(files.length === r.saved && r.saved === r.found && r.found > 0, `the page has ${r.found} images, ${r.saved} were saved, the zip holds ${files.length}`);
  expect(files.every((f) => f.name.startsWith("images/") && f.data.length > 0), "an empty file or a file outside images/ in the zip");
  const standIn = site();
  if (!standIn) return `${files.length} images in images.zip (${Math.round(r.zipBytes / 1024)} KB)`;
  const want: Record<string, string> = standIn.expected.images;
  const got = new Set(files.map((f) => sha256(f.data)));
  const missing = Object.entries(want).filter(([, h]) => !got.has(h)).map(([n]) => n);
  expect(!missing.length, `images missing from the zip, or different bytes: ${missing.join(", ")}`);
  expect(files.every((f) => isPng(f.data) && f.name.endsWith(".png")), "a file in the zip is not a .png image");
  return `images.zip holds the gallery's ${files.length} PNGs byte for byte (sha256 matches ${Object.keys(want).join(", ")})`;
});
