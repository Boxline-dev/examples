# Compare two sites

Read two product sites side by side: each one's headline, features, pricing and what it says makes it different,
which features they share or not, which is cheaper, and a two-sentence summary. A screenshot of each landing page
goes into the report.

| | |
|---|---|
| Uses | `screenshot`, `extract` over two pages with a schema |
| Needs | a model on the API (no model key of your own) |
| Site | any two sites; the runner uses two stand-in landing pages with known prices and features |
| Output | `output/report.md` (a comparison table and the screenshots), `output/a.png`, `output/b.png`, `output/result.json` |

**Inputs** (environment variables):

- `SITE_A`, `SITE_B`: the two pages to compare (default `https://playwright.dev/` and `https://pptr.dev/`). A
  pricing page gives better pricing answers than a home page.

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

Both write to `output/` (`OUTPUT_DIR` picks another folder).

## The result check

`npx tsx check.ts output` reads what the example wrote and exits with 0 only when the result is right. Both pages
loaded, both screenshots are real PNGs, and each site has a name, a headline and features. On the runner's stand-in
pages: Ledgerly costs $29 and Tallybook $49 (so Ledgerly is cheaper), every feature of each is found, bank sync is
shared and payroll is only Tallybook's.
