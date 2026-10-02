import { bytes, check, expect, isPdf, pdfPages, result, site, size } from "../runner/check-lib.js";

check(() => {
  const r = result();
  expect(r.collected > 0 && Array.isArray(r.stories) && r.stories.length > 0, `nothing collected or chosen: ${JSON.stringify(r).slice(0, 200)}`);
  for (const s of r.stories) expect(s.read && s.summary.length > 30, `no real summary for "${s.title}": ${s.summary}`);
  // A story left unread must be one whose page really failed (an error, or an HTTP error status).
  for (const s of r.unread) {
    const p = r.pages.find((x: any) => x.url === s.url);
    expect(p && (p.error || (p.status ?? 0) >= 400), `"${s.title}" was left unread although its page loaded: ${JSON.stringify(p)}`);
  }
  const pdf = bytes("deck.pdf");
  expect(isPdf(pdf), "deck.pdf is not a PDF");
  expect(pdfPages(pdf) === r.stories.length + 1, `the deck should have ${r.stories.length + 1} slides (a title and one per story), it has ${pdfPages(pdf)}`);
  expect(size("digest.md") > 200, "digest.md is missing");
  const st = site();
  if (!st) return `${r.stories.length} stories summarised of ${r.collected} collected (${r.unread.length} pages could not be read); deck of ${pdfPages(pdf)} slides`;
  // The stand-in: exactly the stories on the topics and fresh enough, each summary holding its page's own fact.
  const all = [...st.expected.digest.hn, ...st.expected.digest.feed];
  const want = all.filter((a: any) => a.keep).map((a: any) => a.title).sort();
  expect(r.unread.length === 0, `every stand-in page loads, yet unread: ${r.unread.map((s: any) => s.title).join(", ")}`);
  const got = r.stories.map((s: any) => s.title).sort();
  expect(JSON.stringify(got) === JSON.stringify(want), `chosen: ${got.join(" | ")}; expected: ${want.join(" | ")}`);
  for (const s of r.stories) {
    const { token } = all.find((a: any) => a.title === s.title)!;
    expect(`${s.summary} ${s.whyItMatters}`.includes(token), `the summary of "${s.title}" lacks its page's fact (${token}): ${s.summary}`);
  }
  expect(r.collected === all.length, `${all.length} items should be collected (6 stories, 2 posts), got ${r.collected}`);
  const posted = st.records.chat as { text: string }[];
  expect(posted.length === 1 && r.stories.every((s: any) => posted[0]!.text.includes(s.title)), "the digest did not reach the chat webhook with every story");
  return `4 of 8 chosen (goats, keyboard, a 100-hour-old story and an office move left out), each summary holds its page's fact; deck of ${pdfPages(pdf)} slides; posted to chat`;
});
