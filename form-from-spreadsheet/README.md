# Fill a form from a spreadsheet

Read rows from a CSV with Python in the shell, and fill one form per row with plain-English steps, pausing before the first submit so you can check it in the live view. The row values reach the steps as `%name%`-style variables: the model picks the fields but never sees the values.

| | |
|---|---|
| Uses | `exec` (curl, Python's csv), `step` actions with `variables`, the live view |
| Needs | a plan with shell sessions and plain-English steps, and a model on the API |
| Site | your sheet and form; the defaults are a demo CSV and httpbin.org's demo order form. The runner uses its stand-in |
| Output | `output/result.json` with what the page said after each submit |

**You take part:** It stops after filling the first row: check it in the live view, then press Enter.

**Inputs** (environment variables):

- `SHEET_URL`: a CSV with name, phone and email columns.
- `FORM_URL`: the form (default `https://httpbin.org/forms/post`).
- `ROWS`: how many rows (default `3`).

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

`npx tsx check.ts output` reads what the example wrote and exits with 0 only when the result is right. On the stand-in, the form received rows 1 to 3 with the right phone and email (not row 4), the first only after the review.

