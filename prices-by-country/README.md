# Prices by country

Open the same product page through residential proxies in three countries and compare the prices side by side, with the country each request really came from.

| | |
|---|---|
| Uses | `fetch` and `extract` with a `proxy` per request |
| Needs | a plan with residential proxies (the traffic counts against its allowance) and a model on the API |
| Site | a books.toscrape.com product page, and Cloudflare's trace page for the exit country |
| Output | `output/result.json`: one row per country |

**Inputs** (environment variables):

- `PRODUCT_URL`: the product page (default `https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html`).
- `COUNTRIES`: the proxies' countries (default `US,DE,GB`).

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

`npx tsx check.ts output` reads what the example wrote and exits with 0 only when the result is right. Every request came from its country and every row has a price.

