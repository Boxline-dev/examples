import { bytes, check, expect, result, site } from "../runner/check-lib.js";

check(() => {
  const r = result();
  const mp3 = bytes("article.mp3");
  expect(mp3.subarray(0, 3).toString("latin1") === "ID3" || (mp3[0] === 0xff && (mp3[1]! & 0xe0) === 0xe0), "article.mp3 is not an MP3");
  const expected = (r.words / r.speed) * 60;
  expect(r.durationSeconds > expected * 0.5 && r.durationSeconds < expected * 1.8, `${r.durationSeconds} s for ${r.words} words at ${r.speed} per minute (about ${Math.round(expected)} s expected)`);
  expect(r.paragraphs.length > 0, "no paragraph was read");
  const st = site();
  if (!st) return `"${r.title}": ${r.paragraphs.length} paragraphs (${r.words} words) → ${r.durationSeconds} s of speech`;
  // The stand-in article: its 3 paragraphs, and not the menu or the footer.
  for (const p of st.expected.article.paragraphs) expect(r.paragraphs.includes(p), `a paragraph of the article is missing or changed: ${p.slice(0, 60)}…`);
  const all = r.paragraphs.join(" ");
  expect(!/subscribe|comments are closed|share this/i.test(all), "the menu or footer was read out");
  return `the article's 3 paragraphs, word for word (menu and footer left out), ${r.words} words → ${r.durationSeconds} s MP3`;
});
