# Site map

Crawl a site and see its shape: the page tree, the heaviest pages, the broken links (and which pages link to them),
and the **orphans**: pages the site's `sitemap.xml` lists that no crawled page links to. A crawler alone can never
find orphans, since it only reaches pages that are linked; the sitemap is what shows them.

| | |
|---|---|
| Uses | `crawl` (HTML, so each page's links can be read) |
| Needs | any plan with crawls; no model |
| Site | your site; the default is quotes.toscrape.com (a demo site); the runner uses a stand-in docs site |
| Output | `output/sitemap.md` (tree, orphans, broken links, heaviest pages), `output/result.json` |

Each page sits in the tree under the first page that linked to it (breadth-first). Sizes are the rendered HTML. The
crawl stays on the start page's host and respects robots.txt and crawl-delay; the sitemap is read with a plain HTTP
request from your computer.

**Inputs** (environment variables): `SITE_URL`, `MAX_PAGES` (default 30), `MAX_DEPTH` (default 3), `SITEMAP_URL`
(default `/sitemap.xml` on the site).

## Run it

Put your API key in the environment (`export BOXLINE_API_KEY=bxl_…`, or copy `.env.example` to `.env` and run
`set -a; . ./.env; set +a`). `BOXLINE_API_URL` points the SDK at another API (default `https://api.boxline.dev`).

Node 18 or newer:

```bash
npm install @boxline/sdk tsx
npx tsx node/index.ts
```

Python 3.9 or newer:

```bash
pip install boxline-sdk
python python/main.py
```

Both write to `output/` (`OUTPUT_DIR` picks another folder).

## The result check

`npx tsx check.ts output` reads what the example wrote and exits with 0 only when the result is right. On the runner's
stand-in docs site: the only orphan is the legacy page (in the sitemap, linked from nowhere), the only broken link is
the missing page linked from the FAQ (404), the long advanced guide is the heaviest page, and the tree puts each page
under the right parent.
