# Link checker

Crawl the pages a page links to (on the same site) and report the broken ones (HTTP 400 and up, or not loading) and the slow ones (timed with fetch, one at a time). Its links to other sites are opened too and sorted into working, broken and blocked: a site that answers 401, 403 or 429, or shows a CAPTCHA, refuses automated visitors, so check those links by hand.

| | |
|---|---|
| Uses | `crawl` (depth 1) for each page's status, `fetch` for its load time |
| Needs | any plan; no model |
| Site | your page; the default is books.toscrape.com (a demo shop). The runner uses its stand-in site: two good pages, a missing one and a slow one |
| Output | `output/result.json`: every page checked, the broken and the slow ones, and the links to other sites with their verdicts |

**Inputs** (environment variables):

- `SITE_URL`: the page whose links to check (default `https://books.toscrape.com/`).
- `MAX_PAGES`: how many pages at most (default `20`).
- `SLOW_MS`: slower than this is reported (default `2000`).
- `MAX_EXTERNAL`: how many links to other sites to open at most (default `15`).

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

Both write to `output/` (`OUTPUT_DIR` picks another folder) and stop their sessions when they finish.

## The result check

`npx tsx check.ts output` reads what the example wrote and exits with 0 only when the result is right. On the stand-in, /links/missing is broken (404), /links/slow is slow (2.6 s), the good pages are not reported, the link to example.com works and the link to a domain that cannot exist is broken.

