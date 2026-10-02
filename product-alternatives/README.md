# Product alternatives

Read a product page, find comparable products, rank them by how close they are (with a reason each) and show the
price difference. Prices are remembered, so the next run says which went up or down.

| | |
|---|---|
| Uses | `extract` (the product, then the candidates in one call), `search` when no candidates are given |
| Needs | a model on the API (no model key of your own); web search when `CANDIDATES` is empty |
| Site | a books.toscrape.com product (a demo shop) and four candidates; any product page of yours |
| Output | `output/alternatives.md`, `output/result.json` |

Candidates come from `CANDIDATES` (product pages you choose: your catalogue, a few shops you trust) or from the
platform's web search. Each is scored from 0 (nothing alike) to 1 (the same kind of thing for the same buyer); pages
that sell nothing are left out. The difference in price is given when both are in the same currency.

**Inputs** (environment variables): `PRODUCT_URL`, `CANDIDATES`, `STATE_DIR` (keep it between runs).

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

`npx tsx check.ts output` reads what the example wrote and exits with 0 only when the result is right. The alternatives
are ranked, each comes from a candidate page, and each price difference is right. For the demo: "A Light in the Attic"
costs £51.77, the three poetry books are alternatives, and the travel book ranks last or is left out.
