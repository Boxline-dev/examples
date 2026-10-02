import { readFileSync } from "node:fs";
import { check, expect, file, readJson, result, site } from "../runner/check-lib.js";

check(() => {
  const r = result();
  expect(r.rounds?.length >= 1 && r.rounds[0].fresh.length > 0, "the first round found nothing to draft");
  const posts = readJson("posts.json");
  const md = readFileSync(file("newsletter.md"), "utf8");
  for (const p of posts) {
    expect(p.draft === true && p.text.length <= 280 && p.text.endsWith(p.source), `a post is not a draft, too long, or lacks its link: ${JSON.stringify(p)}`);
    expect(md.includes(`](${p.source})`), `the newsletter has no section linking ${p.source}`);
  }
  expect(md.startsWith("<!-- DRAFT"), "the newsletter is not marked as a draft");
  const st = site();
  if (!st) return `${r.rounds[0].fresh.length} new posts drafted: a newsletter and ${posts.length} post drafts, each with its link`;
  // The stand-in: round 1 drafts the 3 posts there; round 2 only the 2 added since.
  expect(r.rounds.length === 2, `2 rounds expected, got ${r.rounds.length}`);
  const slugs = (urls: string[]) => urls.map((u) => u.split("/news/")[1]).sort().join(",");
  expect(slugs(r.rounds[0].fresh) === "audit-log,edge-cache,sso", `round 1 should draft the first 3 posts: ${slugs(r.rounds[0].fresh)}`);
  expect(slugs(r.rounds[1].fresh) === "pricing,regions", `round 2 should draft only the 2 new posts: ${slugs(r.rounds[1].fresh)}`);
  const text = r.items.map((i: any) => `${i.summary} ${i.post}`).join(" ");
  expect(/Osaka/.test(text) && /0\.017/.test(text), `the drafts lack the new posts' own facts (Osaka, $0.017): ${text.slice(0, 200)}`);
  return `round 1: 3 posts drafted; round 2: only the 2 new ones (regions, pricing), facts kept; ${posts.length} post drafts ≤ 280 characters with links; newsletter marked DRAFT`;
});
