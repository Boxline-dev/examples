# Financial report to data

Find a company's latest quarterly report on its investor page, download the PDF in the shell, turn it into text with pdftotext, and have a model read the key figures into JSON.

| | |
|---|---|
| Uses | the actions API (`goto`, `evaluate`), `exportCookies`, `exec` (curl, pdftotext), `files.readText`, the `extract` action with a schema |
| Needs | a plan with shell sessions and a model on the API |
| Site | your company's investor relations page (`INVESTOR_URL`, required). The runner uses its stand-in: an annual report and two quarterly reports, the latest listed last |
| Output | `output/report.txt` and `output/figures.json` |

**Inputs** (environment variables):

- `INVESTOR_URL`: the page that lists the reports (required).

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

`npx tsx check.ts output` reads what the example wrote and exits with 0 only when the result is right. On the stand-in, the Q3 2026 report was picked, and revenue, net income, EPS and cash are exactly the printed figures.

