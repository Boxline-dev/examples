# Site to Markdown

Crawl a site into clean Markdown files, one per page, with each page's address and title at the top: ready for AI search. The crawler respects robots.txt and crawl-delay.

| | |
|---|---|
| Uses | `crawl.start` and `crawl.wait` (breadth-first, same host) |
| Needs | any plan with crawls; no model |
| Site | quotes.toscrape.com (a demo site) |
| Output | `output/site/<page>.md` and `output/site/index.json` |

**Inputs** (environment variables):

- `START_URL`: where the crawl starts (default `https://quotes.toscrape.com/`).
- `MAX_PAGES`: how many pages at most (default `6`).

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

Both write to `output/` (`OUTPUT_DIR` picks another folder) and release their sessions when they finish.

## The result check

`npx tsx check.ts output` reads what the example wrote and exits with 0 only when the result is right. At least 3 Markdown files, all from the start page's host, each with its header and no HTML left; the start page holds its first quote.

