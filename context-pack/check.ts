import { readFileSync } from "node:fs";
import { check, expect, file, readJson, result, site } from "../runner/check-lib.js";

check(() => {
  const r = result();
  const pack = readFileSync(file("pack.md"), "utf8");
  const json = readJson("pack.json");
  expect(r.tokens <= r.budget, `the pack is ${r.tokens} tokens, over the budget of ${r.budget}`);
  expect(json.sources.length > 0 && json.sources.every((s: any, i: number) => s.id === `S${i + 1}` && s.facts.length >= 1), "every source needs a tag S1, S2, … and at least one fact");
  const factLines = pack.split("\n").filter((l) => l.startsWith("- "));
  expect(factLines.length > 0 && factLines.every((l) => /\[S\d+\]$/.test(l)), "every fact line must end with its source tag");
  for (const s of json.sources) for (const f of s.facts) expect(pack.includes(`- ${f.fact} [${s.id}]`), `a fact of ${s.id} is missing from pack.md or carries the wrong tag`);
  const st = site();
  if (!st) return `${json.sources.length} sources, ${factLines.length} cited facts in ${r.tokens} of ${r.budget} tokens (${r.unverified} unverified, ${r.dropped} cut)`;
  // The stand-in docs pages: each page's own fact under its own tag.
  const want: [string, RegExp][] = [["S1", /2\.5/], ["S2", /730/], ["S3", /3rd|third/i]];
  for (const [id, re] of want) {
    const s = json.sources.find((x: any) => x.id === id);
    expect(s && s.facts.some((f: any) => re.test(f.fact)), `${id} (${s?.url}) should carry its page's fact ${re}: ${JSON.stringify(s?.facts?.map((f: any) => f.fact))}`);
    for (const [other, ore] of want) if (other !== id) expect(!s.facts.some((f: any) => ore.test(f.fact)), `${id} carries ${other}'s fact`);
  }
  return `3 sources, ${factLines.length} facts each tagged with its own source (2.5 GB → S1, 730 queues → S2, the 3rd → S3), quotes checked; ${r.tokens} of ${r.budget} tokens`;
});
