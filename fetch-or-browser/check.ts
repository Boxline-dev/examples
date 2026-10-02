import { check, expect, result } from "../runner/check-lib.js";

check(() => {
  const r = result();
  const f = r.fetch;
  expect(f?.status === 200 && f.hasEinstein && f.chars > 1000 && f.links > 10, `fetch returned ${JSON.stringify(f)}`);
  const pages = r.session?.pages ?? [];
  expect(pages.length === 2, `the session read ${pages.length} pages, not 2`);
  expect(/\/page\/2\/$/.test(pages[0].url) && /\/page\/3\/$/.test(pages[1].url), `the session ended on ${pages.map((p: any) => p.url).join(", ")}`);
  expect(pages.every((p: any) => p.authors.length === 10), "a page does not have 10 quotes");
  expect(JSON.stringify(pages[0].authors) !== JSON.stringify(pages[1].authors), "pages 2 and 3 have the same quotes");
  return `fetch: "${f.title}", ${f.chars} chars of Markdown, ${f.links} links in ${f.ms} ms; the session clicked on to /page/3/ (10 quotes, first by ${pages[1].authors[0]}) in ${r.session.ms} ms`;
});
