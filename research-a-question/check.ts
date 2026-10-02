import { check, expect, result } from "../runner/check-lib.js";

const norm = (u: string) => u.replace(/^https?:\/\/(www\.)?/, "").replace(/[#?].*$/, "").replace(/[/.,;]+$/, "");

check(() => {
  const r = result();
  expect(r.status === "completed", `the run ended ${r.status}`);
  expect(r.searches.length >= 1, "the agent never searched the web");
  expect(r.sources.length >= 2, `the answer cites ${r.sources.length} sources, not at least 2`);
  const opened = r.opened.map(norm);
  const unread = r.sources.filter((s: string) => !opened.some((o: string) => o === norm(s) || o.startsWith(norm(s)) || norm(s).startsWith(o)));
  expect(!unread.length, `cited but never opened: ${unread.join(", ")}`);
  const body = String(r.answer).split(/\bSources:/i)[0]!;
  if (/James Webb/.test(r.question)) expect(/2021/.test(body) && /\bL2\b|Lagrange/i.test(body), `the answer lacks the launch year or the orbit: ${body.slice(0, 200)}`);
  return `${r.searches.length} search${r.searches.length === 1 ? "" : "es"} ("${r.searches[0]}"), ${r.opened.length} pages opened, ${r.sources.length} cited (${r.sources.map(norm).join(", ").slice(0, 120)}); "${body.trim().slice(0, 90)}"`;
});
