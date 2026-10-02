import { readFileSync } from "node:fs";
import { check, expect, file, result, site } from "../runner/check-lib.js";

const lines = (name: string) => readFileSync(file(name), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

check(() => {
  const r = result();
  const train = lines("train.jsonl");
  const evalSet = lines("eval.jsonl");
  expect(train.length === r.train && evalSet.length === r.eval && train.length > 0 && evalSet.length > 0, `train ${train.length} / eval ${evalSet.length} do not match result.json (${r.train} / ${r.eval}) or one is empty`);
  const ids = new Set(train.map((x) => x.id));
  expect(!evalSet.some((x) => ids.has(x.id)), "a record is in both train and eval");
  const all = [...train, ...evalSet];
  for (const x of all) expect(x.type === "text" ? x.text.length >= 40 : x.question && x.answer && x.evidence, `a malformed record: ${JSON.stringify(x).slice(0, 160)}`);
  const pairs = all.filter((x) => x.type === "qa");
  expect(pairs.length >= 1 && r.pages.length > 0, `no question-answer pairs (${r.unverified} dropped as unverified)`);
  const st = site();
  if (!st) return `${r.pages.length} pages → ${r.passages} passages and ${r.pairs} pairs (${r.duplicates} near-duplicates, ${r.unverified} unverified pairs dropped); train ${train.length}, eval ${evalSet.length}`;
  // The stand-in docs: the support paragraph (on two pages, one word apart) is kept once; the facts become questions.
  const d = st.expected.docsSite;
  const support = all.filter((x) => x.type === "text" && x.text.includes("Need help with any of this?"));
  expect(support.length === 1 && r.duplicates >= 1, `the near-duplicate support paragraph should be kept once, found ${support.length} (${r.duplicates} dropped)`);
  for (const x of all) expect(!x.text?.includes("Contact sales") && !x.text?.includes("All rights reserved"), `boilerplate in a record: ${x.text?.slice(0, 100)}`);
  const tokens: Record<string, RegExp> = { "/docs-site/": /\b14\b/, "/docs-site/install": /2\.5/, "/docs-site/guide": /730/, "/docs-site/guide/advanced": /\b9\b|nine/i, "/docs-site/faq": /3rd|third/i };
  const asked = Object.entries(tokens).filter(([path, re]) => pairs.some((q) => new URL(q.url).pathname === path && re.test(q.answer)));
  expect(asked.length >= 3, `at least 3 pages' own facts should come back as answers, got ${asked.map(([p]) => p).join(", ") || "none"}`);
  void d;
  return `5 pages → ${r.passages} passages, support paragraph kept once (${r.duplicates} near-duplicate dropped), nav/footer gone; ${pairs.length} verified pairs covering ${asked.length} pages' facts; train ${train.length} / eval ${evalSet.length}`;
});
