import { readFileSync } from "node:fs";
import { check, expect, file, result, site } from "../runner/check-lib.js";

check(() => {
  const r = result();
  const chunks = readFileSync(file("chunks.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  expect(chunks.length === r.chunks && chunks.length > 0, `chunks.jsonl has ${chunks.length} lines, result.json says ${r.chunks}`);
  for (const c of chunks) {
    expect(c.id && c.url && c.text && c.embedText.endsWith(c.text), `a malformed chunk: ${JSON.stringify(c).slice(0, 160)}`);
    expect(c.tokens <= r.maxTokens, `chunk ${c.id} has ${c.tokens} tokens, over the budget of ${r.maxTokens}`);
  }
  expect(new Set(chunks.map((c: any) => c.id)).size === chunks.length, "chunk ids repeat");
  const st = site();
  if (!st) return `${chunks.length} chunks from ${r.pages.length} pages, all within ${r.maxTokens} tokens; ${r.boilerplate.length} boilerplate lines removed`;
  // The stand-in docs site: nav and footer on every page are gone; each page's fact sits under its own heading.
  const d = st.expected.docsSite;
  for (const c of chunks) expect(!c.text.includes("Contact sales") && !c.text.includes("All rights reserved"), `boilerplate left in ${c.id}: ${c.text.slice(0, 120)}`);
  for (const pg of d.pages.filter((x: any) => x.path !== "/docs-site/legacy")) {
    const c = chunks.find((x: any) => x.text.includes(pg.fact));
    expect(c, `the fact of ${pg.path} is in no chunk: ${pg.fact}`);
    expect(c.headings.includes(pg.section) && c.headings[0] === pg.title, `${pg.path}'s fact is under ${JSON.stringify(c.headings)}, not [${pg.title}, ${pg.section}]`);
  }
  const advanced = chunks.filter((c: any) => c.url.endsWith("/docs-site/guide/advanced"));
  expect(advanced.length >= 2, `the long advanced guide should be cut into 2 or more chunks, got ${advanced.length}`);
  return `${chunks.length} chunks ≤ ${r.maxTokens} tokens; nav and footer removed; every fact under its heading path; the long page cut into ${advanced.length}`;
});
