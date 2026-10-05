# Get a page, or a browser?

The same site two ways. `fetch` is one call that returns the page as Markdown (rendered in a real browser in a sandbox): use it to read. A session is a browser that stays open between calls, so it can click through pages, fill forms and sign in: here it clicks on to page 3.

| | |
|---|---|
| Uses | `fetch` (Markdown and links), a session driven by the actions API (`goto`, `click`, `wait`, `evaluate`) |
| Needs | any plan; no shell, no model |
| Site | quotes.toscrape.com, a demo site made for scraping practice |
| Output | `output/result.json`: what fetch returned (title, size, links, time) and what the session read on pages 2 and 3 |

**Inputs** (environment variables):

- `PAGE_URL`: the page to read (the session part clicks `li.next a`) (default `https://quotes.toscrape.com/`).

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

`npx tsx check.ts output` reads what the example wrote and exits with 0 only when the result is right. Fetch returned the page (HTTP 200, Einstein's quote, over 10 links), and the session ended on /page/3/ with 10 quotes on each page.

