# My invoices

Open your billing page signed in with a profile and download the invoices of the last 3 months through the browser; the files API copies them to your computer.

| | |
|---|---|
| Uses | sessions with `profile: {id}`, Playwright over CDP, the downloads folder, `files.list` and `files.read` |
| Needs | a plan with profiles, and a profile signed in to the site (from "Save a login once"); no model |
| Site | your billing page (`BILLING_URL`) with dates written YYYY-MM-DD. The runner uses its stand-in billing page |
| Output | `output/invoices/*.pdf` and `output/result.json` |

**Inputs** (environment variables):

- `BILLING_URL`: your billing page (required).
- `PROFILE_ID`: a profile signed in to that site (required).
- `MONTHS`: this month and the months before (default `3`).

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

`npx tsx check.ts output` reads what the example wrote and exits with 0 only when the result is right. On the stand-in, exactly the three invoices of the last 3 months were downloaded as their PDFs, and the older one was left alone.

