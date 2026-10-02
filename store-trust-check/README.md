# Store trust check

Before buying from an online store you do not know, gather the signals that tell a real shop from a scam and score
them, with every reason shown.

| | |
|---|---|
| Uses | a shell session (curl and jq for RDAP, openssl for the certificate), `crawl`, `extract` over the store's pages |
| Needs | shell sessions and a model on the API (no model key of your own) |
| Site | the stores you give it; the runner uses two stand-in stores |
| Output | `output/report.md`, `output/result.json` |

What it checks:

- **From its pages** (the home page and the contact, returns, privacy and terms pages it links to): who runs it
  (name, address, phone, company number), a returns policy and its window, a privacy policy, the ways to pay,
  pressure tactics (countdowns, "only 2 left") and discounts of 80% or more.
- **From the machine's shell:** when the domain was registered (RDAP, the registries' public API) and who issued its
  certificate.

Each warning sign adds points (payments you cannot dispute 3; no address, no returns policy, no returns (or a store that refuses them), pressure tactics or a
domain under 90 days old 2; the others 1): 6 or more is high risk, 3 to 5 medium. It is a score from public signals,
not a verdict.

**Inputs** (environment variables): `STORE_URLS`, comma-separated.

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

`npx tsx check.ts output` reads what the example wrote and exits with 0 only when the result is right. Every store has a
risk and a score that adds up its signals. On the runner's stand-in stores: the ceramics shop with its address,
returns and privacy policies is low risk; the "mega deals" page is high risk, with no address, a store that refuses refunds,
payment only by bitcoin, gift cards or bank transfer, and a countdown among its reasons.
