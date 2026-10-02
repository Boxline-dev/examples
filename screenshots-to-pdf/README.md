# Screenshots to a PDF report

Screenshot several pages in the session's browser, then combine them into one PDF with Python (Pillow) in the session's shell.

| | |
|---|---|
| Uses | the actions API (`goto`, `screenshot`), `files.write`, `exec` (Python, Pillow), `files.read` |
| Needs | a plan with shell sessions; no model |
| Site | books.toscrape.com, quotes.toscrape.com and httpbin.org |
| Output | `output/shot-N.png` and `output/report.pdf` |

**Inputs** (environment variables):

- `URLS`: the pages, comma-separated (default `https://books.toscrape.com/,https://quotes.toscrape.com/,https://httpbin.org/`).

`combine.py` is the Python script both versions upload and run in the session.

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

`npx tsx check.ts output` reads what the example wrote and exits with 0 only when the result is right. Report.pdf has one page per screenshot, and every screenshot is a PNG of a loaded page.

