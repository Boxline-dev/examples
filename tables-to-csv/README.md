# Tables to CSV

**Give your AI agents the infrastructure they need: browsers, shells, storage and isolated machines.**

Every data table on a page, read in a real browser, written as CSV, with the numbers in each column worked out in the
session's shell. No model reads the data: what is in the CSV is what is on the page.

| | |
|---|---|
| Uses | `sessions.create` with `shell`, `session.goto`, `session.evaluate` (`tables.js`), `session.files`, `session.exec` (`to_csv.py`) |
| Needs | a plan with shell sessions |
| Site | Wikipedia's [List of largest cities](https://en.wikipedia.org/wiki/List_of_largest_cities) by default (`PAGE_URL` for yours). The runner uses its stand-in: two tables with a two-row header, a merged cell, footnote marks and thousands separators |
| Output | `output/tables/table-N.csv`, `output/summary.md` (each numeric column's count, sum, min, max, mean) and `output/result.json` |

**Inputs** (environment variables):

- `PAGE_URL`: the page with the tables (default: the list of largest cities).

What the browser step takes care of, which a plain download of the HTML does not:
- merged cells: a value that spans rows or columns is repeated in each cell it covers;
- headers over two rows are joined per column ("Lighthouse / Name");
- footnote marks (`[1]`, `[a]`) and sort keys are left out;
- tables a page builds with JavaScript are there too.

Then `to_csv.py` writes the CSV files with Python's `csv` module, and treats a column as numeric when almost every
filled cell starts with a number ("1,204,567" → 1204567, "82.5 m" → 82.5).

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

`npx tsx check.ts output` reads the CSV files back and exits with 0 only when each one has the page's header and
exactly the page's number of data rows, all of the same width. On the stand-in it also compares both tables cell for
cell and the sums: heights 343.5, population 1,805,880, mean area 180.9.

