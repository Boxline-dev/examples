import { readFileSync } from "node:fs";
import { check, expect, file, readJson, result } from "../runner/check-lib.js";

check(() => {
  const r = result();
  expect(r.status === "completed", `the crawl ended ${r.status}`);
  const index = readJson<{ url: string; title: string; file: string; chars: number }[]>("site/index.json");
  expect(index.length >= 3, `only ${index.length} Markdown files`);
  const hosts = new Set(index.map((p) => new URL(p.url).host));
  expect(hosts.size === 1 && hosts.has(new URL(r.start).host), `pages from other hosts: ${[...hosts].join(", ")}`);
  for (const p of index) {
    const md = readFileSync(file(`site/${p.file}`), "utf8");
    expect(md.startsWith(`---\nurl: ${p.url}\n`) && md.length > p.chars, `site/${p.file} lacks its header or content`);
    expect(!/<(div|span|script|style)\b/i.test(md), `site/${p.file} still holds HTML tags`);
  }
  if (/quotes\.toscrape\.com/.test(r.start)) {
    const home = readFileSync(file(`site/${index[0]!.file}`), "utf8");
    expect(/Albert Einstein/.test(home) && /world as we have created it/i.test(home), "the start page's Markdown lacks its first quote");
  }
  const total = index.reduce((a, p) => a + p.chars, 0);
  return `${index.length} Markdown files (${total} chars, no HTML left), all on ${[...hosts][0]}; start page holds the Einstein quote; ${r.skippedByRobots} skipped by robots.txt`;
});
