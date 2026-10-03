# Earnings from EDGAR

**Give your AI agents the infrastructure they need: browsers, shells, storage and isolated machines.**

Yearly revenue, net income and diluted EPS of a few public companies, straight from the filings: SEC EDGAR's official
companyfacts API, read in a session's shell with Python. Growth and margins are worked out there too, with a CSV, a
chart and a short summary. No model reads or writes a number, so every figure is one a company filed.

| | |
|---|---|
| Uses | a `browser: false` shell session, `session.files`, `session.exec` (`edgar.py`: requests, matplotlib) |
| Needs | a plan with shell sessions; your name and email for SEC (`SEC_USER_AGENT`) |
| Site | [SEC EDGAR APIs](https://www.sec.gov/search-filings/edgar-application-programming-interfaces) (public data; [fair access](https://www.sec.gov/os/accessing-edgar-data): a declared user agent, at most 10 requests a second) |
| Output | `output/summary.md`, `output/earnings.csv`, `output/chart.png` (revenue and net income per year) and `output/result.json` |

**Inputs** (environment variables):

- `SEC_USER_AGENT` (required): who you are, e.g. `Jane Doe jane@example.com`. SEC refuses automated requests without
  one; it goes in every request's `User-Agent` header.
- `TICKERS`: comma-separated (default `AAPL,MSFT,NVDA`).
- `YEARS`: fiscal years per company (default 4).

How `edgar.py` picks a year's value, which matters more than it looks:
- only 10-K facts whose period is about a year (350 to 380 days); quarterly 10-Q facts sit in the same lists;
- each 10-K repeats the two years before it, and a later one may restate a year: for each period end, the value filed
  last wins;
- companies change the concept they report revenue under (`Revenues`,
  `RevenueFromContractWithCustomerExcludingAssessedTax`, `SalesRevenueNet`…): the one with the most recent year is used,
  and named in the output.

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

Both write to `output/` (`OUTPUT_DIR` picks another folder) and release their session when they finish.

## The result check

`npx tsx check.ts output` exits with 0 only when every ticker has at least three years in order, `earnings.csv` has a
row for each, `chart.png` is a PNG, and every growth and margin figure agrees with the revenue and income beside it. On
the stand-in it also compares every year exactly: a restated year must have its later value, quarters must be left
out, and every request must have declared a user agent.

