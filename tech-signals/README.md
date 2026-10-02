# Tech signals

Find the themes that many Hacker News stories of the last days share, read each theme's stories, and make one
grounded prediction per theme: a short claim, why, how confident, and the facts from the pages it rests on.

| | |
|---|---|
| Uses | a shell session (`exec`, files), `extract` over each theme's pages |
| Needs | shell sessions and a model on the API (no model key of your own) |
| Site | Hacker News' official search API; the runner uses a stand-in set of stories |
| Output | `output/predictions.md`, `output/result.json` (themes, stories, predictions and their evidence) |

How it works:

1. **On the machine:** `signals.py` collects the window's stories with at least `MIN_POINTS` points through HN's
   search API, page by page, and finds the themes: a term two or more stories share (terms with the very same
   stories are one theme, like "rust kernel linux"), ranked by the stories' points and comments. A story belongs to
   one theme only. One script, so the Node and Python versions do the same thing.
2. **In a sandboxed browser:** for each theme, one `extract` call reads up to 3 of its stories' pages and returns a
   prediction for the next 6 to 12 months with 2 to 4 facts, each citing its page. Predictions come from what the
   pages say, not from headlines alone.

**Inputs** (environment variables): `WINDOW_HOURS` (default 48), `MIN_POINTS` (default 50), `TOP` themes
(default 3), `HN_SEARCH_URL`.

## Run it

Put your API key in the environment (`export BOXLINE_API_KEY=bxl_…`, or copy `.env.example` to `.env` and run
`set -a; . ./.env; set +a`). `BOXLINE_API_URL` points the SDK at another API (default `https://api.boxline.dev`).
Run from this folder (both versions upload `signals.py` from it).

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

## The result check

`npx tsx check.ts output` reads what the example wrote and exits with 0 only when the result is right. Each
prediction has a short claim, a confidence and at least 2 facts, every fact citing one of its own theme's stories.
On the runner's stand-in stories: exactly two themes, WebGPU (3 stories) first and Rust in the Linux kernel (2)
second, the off-theme stories left alone, and each prediction quoting facts that are only on its own pages.
