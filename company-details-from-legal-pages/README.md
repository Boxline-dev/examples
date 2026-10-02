# Company details from its legal pages

Crawl a site's pages, pick its terms, privacy and imprint pages, and have a model read the organisation's legal name and postal address from them.

| | |
|---|---|
| Uses | `crawl` (depth 1), `extract` with several `urls` and a schema |
| Needs | a model on the API |
| Site | any site; the default is eff.org. The runner uses its stand-in company site (terms, privacy notice and a blog) |
| Output | `output/company.json` |

**Inputs** (environment variables):

- `SITE_URL`: the site (default `https://www.eff.org/`).

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

`npx tsx check.ts output` reads what the example wrote and exits with 0 only when the result is right. On the stand-in, the legal name and address come from the privacy notice, and the blog was not read.

