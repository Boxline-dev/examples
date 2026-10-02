# Download and add up

The browser downloads a CSV report, Python in the shell adds up its revenue column and saves the total, and the browser types the total into a form. Browser, shell and files share one `/workspace`.

| | |
|---|---|
| Uses | Playwright over CDP, the downloads folder, `files.waitFor`, `exec` (Python), `files.readText` |
| Needs | a plan with shell sessions; no model |
| Site | your report page and form; without them a demo report made in the browser and httpbin.org's demo form. The runner uses its stand-in |
| Output | `output/report.csv`, `output/total.txt` and `output/result.json` |

**Inputs** (environment variables):

- `REPORT_PAGE_URL`: a page with a link to a CSV that has a revenue column.
- `FORM_URL`: the form (its first text box gets the total) (default `https://httpbin.org/forms/post`).

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

Both write to `output/` (`OUTPUT_DIR` picks another folder) and release their sessions when they finish.

## The result check

`npx tsx check.ts output` reads what the example wrote and exits with 0 only when the result is right. The total matches the CSV, and the form page echoed it (on the stand-in: the form received 6200).

