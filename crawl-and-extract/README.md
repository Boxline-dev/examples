# Crawl and extract

Find every page of one kind on a site, then pull the same fields from each into JSONL and CSV. The crawl follows only
links that match a pattern (product pages, say, not categories), and `extract` reads 10 pages per call with one schema.
Each price is then checked against the page's own crawled text: a row whose price is not written on its page is
marked `verified: false`, so a model slip does not go unnoticed.

| | |
|---|---|
| Uses | `crawl` with `include`, `extract` over 10 pages per call with a schema |
| Needs | a model on the API (no model key of your own) |
| Site | books.toscrape.com (a demo shop): every book in its Poetry category |
| Output | `output/items.jsonl`, `output/items.csv`, `output/result.json` |

For your own site: set `START_URL` to a listing page, `INCLUDE` to a regular expression your item pages' addresses
match, and change the schema and prompt to the fields you need. The crawl respects robots.txt and crawl-delay.

**Inputs** (environment variables): `START_URL`, `INCLUDE`, `MAX_PAGES` (default 40).

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

`npx tsx check.ts output` reads what the example wrote and exits with 0 only when the result is right. There is one
row per matched page (10 or more), no row for a page that was not crawled, prices and ratings are plausible, at least
90% of prices are written on their page, and "A Light in the Attic" costs £51.77 with 22 in stock.
