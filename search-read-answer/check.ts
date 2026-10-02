import { check, expect, result } from "../runner/check-lib.js";

const norm = (u: string) => u.replace(/^https?:\/\/(www\.)?/, "").replace(/[#?].*$/, "").replace(/\/$/, "");

check(() => {
  const r = result();
  expect(r.results?.length >= 3, `only ${r.results?.length ?? 0} search results`);
  const read = r.results.filter((x: any) => x.read).map((x: any) => norm(x.url));
  expect(read.length >= 1, "no search result could be read");
  expect(typeof r.answer === "string" && r.answer.length > 10, `no answer: ${JSON.stringify(r.answer)}`);
  if (/Python programming language first released/.test(r.question)) expect(/1991/.test(r.answer), `the answer does not say 1991: ${r.answer}`);
  expect(r.sources?.length >= 1, "the answer names no sources");
  const unknown = r.sources.filter((s: string) => !read.includes(norm(s)));
  expect(!unknown.length, `sources that were not among the pages read: ${unknown.join(", ")}`);
  return `"${r.answer.slice(0, 90)}" from ${r.sources.length} of the ${read.length} pages read (${r.sources.map(norm).join(", ")}); ${r.results.length} search results`;
});
