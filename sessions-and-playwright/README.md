# Sessions and Playwright

Start a session, connect Playwright to its browser over CDP, read a page, and stop the session. The same page is then read through the actions API, which drives the browser without Playwright.

| | |
|---|---|
| Uses | sessions, Playwright over CDP (`connectUrl`), the actions API (`content`) |
| Needs | any plan; no shell, no model |
| Site | books.toscrape.com, a demo shop made for scraping practice |
| Output | `output/result.json`: the page title and the first 5 books with their prices |

## Run it

Put your API key in the environment (`export BOXLINE_API_KEY=bxl_…`, or copy `.env.example` to `.env` and run
`set -a; . ./.env; set +a`). `BOXLINE_API_URL` points the SDK at another API (default `https://api.boxline.dev`).

Node 18 or newer:

```bash
npm install @boxline/sdk playwright-core tsx
npx tsx node/index.ts
```

Python 3.9 or newer:

```bash
pip install boxline-sdk playwright
python python/main.py
```

Both write to `output/` (`OUTPUT_DIR` picks another folder) and stop their sessions when they finish.

## The result check

`npx tsx check.ts output` reads what the example wrote and exits with 0 only when the result is right. There are 5 books, the first is "A Light in the Attic" at £51.77, every book has a £ price, and Playwright and the actions API saw the same page.

