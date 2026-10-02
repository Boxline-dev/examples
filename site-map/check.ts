import { check, expect, result, site, size } from "../runner/check-lib.js";

check(() => {
  const r = result();
  expect(r.status === "completed" && r.pages.length > 1, `the crawl did not complete with pages: ${r.status}, ${r.pages?.length}`);
  expect(r.heaviest.length > 0 && size("sitemap.md") > 100, "the heaviest pages or sitemap.md are missing");
  const st = site();
  if (!st) return `${r.pages.length} pages, ${r.orphans.length} orphans, ${r.broken.length} broken, heaviest ${r.heaviest[0].path}`;
  // The stand-in docs site: one orphan (in the sitemap, linked from nowhere), one broken link, the long page heaviest.
  const p = (x: string) => r.pages.find((q: any) => q.path === x);
  expect(JSON.stringify(r.orphans) === JSON.stringify(["/docs-site/legacy"]), `the orphan is /docs-site/legacy: ${JSON.stringify(r.orphans)}`);
  expect(r.broken.length === 1 && r.broken[0].path === "/docs-site/missing" && r.broken[0].status === 404 && r.broken[0].linkedFrom.includes("/docs-site/faq"), `the broken link is /docs-site/missing (404) from the FAQ: ${JSON.stringify(r.broken)}`);
  expect(r.heaviest[0].path === "/docs-site/guide/advanced", `the advanced guide is the heaviest page: ${r.heaviest[0].path}`);
  expect(p("/docs-site/guide/advanced")?.parent === "/docs-site/guide" && p("/docs-site/install")?.parent === "/docs-site/", "the tree is wrong: the advanced guide sits under the guide, install under home");
  expect(!p("/docs-site/legacy"), "the orphan was crawled, so it is linked after all?");
  return `orphan: /docs-site/legacy (sitemap only); broken: /docs-site/missing (404, from the FAQ); heaviest: the advanced guide; tree right`;
});
