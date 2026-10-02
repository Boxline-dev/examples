import { check, expect, result, site, size } from "../runner/check-lib.js";

const norm = (s: string) => s.toLowerCase().replace(/[“”"'’]/g, "").replace(/\s+/g, " ").trim();

check(() => {
  const r = result();
  const d = r.discussion;
  expect(r.article?.summary && r.article.keyPoints.length >= 2, "the article summary or key points are missing");
  expect(d?.summary && d.viewpoints.length >= 2, `at least 2 viewpoints expected, got ${d?.viewpoints?.length}`);
  for (const v of d.viewpoints) expect(["many", "some", "few"].includes(v.support) && v.quote.length > 5, `a viewpoint without support or quote: ${JSON.stringify(v)}`);
  expect(size("discussion.md") > 300, "discussion.md is missing");
  const st = site();
  if (!st) return `"${r.story.title}": ${d.viewpoints.length} viewpoints, ${d.disagreements.length} disagreements, ${d.openQuestions.length} open questions`;
  // The stand-in: the right story (fresh, linked, discussed), and a summary true to its article and comments.
  const want = st.expected.discuss;
  expect(r.story.objectID === want.chosen, `the story should be "${want.article.title}" (most votes in 24 h with a link and 20+ comments), got "${r.story.title}"`);
  expect(`${r.article.summary} ${r.article.keyPoints.join(" ")}`.includes(want.article.token), `the article summary lacks its fact (${want.article.token})`);
  const comments = want.comments.map((c: any) => norm(c.text));
  for (const v of d.viewpoints) expect(comments.some((c: string) => c.includes(norm(v.quote))), `the quote is not in any comment: "${v.quote}"`);
  expect(/licen[cs]e|bsl/i.test(d.disagreements.join(" ")), `the BSL licence is the dispute: ${d.disagreements.join("; ")}`);
  expect(/durab|fsync/i.test(d.openQuestions.join(" ")), `durability (fsync) is the open question: ${d.openQuestions.join("; ")}`);
  return `Tallowdb chosen (older, unlinked and quiet stories left out); ${d.viewpoints.length} viewpoints, every quote from a comment; dispute: the licence; open: durability`;
});
