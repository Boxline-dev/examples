# Gift ideas

Describe the person and a budget, and get gift ideas found on real gift guides and reviews, each with why it suits
them, a price range when the page gives one, and the page it came from. Ideas over the budget are left out.

| | |
|---|---|
| Uses | `search`, `extract` over the top pages |
| Needs | web search and a model on the API (no keys of your own) |
| Site | whatever the search finds (gift guides, reviews) |
| Output | `output/ideas.md`, `output/result.json` |

No shop is scraped: the search goes through the platform's search provider, and the ideas come from the pages it
finds. An idea kept must name a page that was read, and one whose lowest price is over the budget (in the same
currency) is dropped.

**Inputs** (environment variables): `RECIPIENT`, `BUDGET` (default 60), `CURRENCY` (default USD).

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

`npx tsx check.ts output` reads what the example wrote and exits with 0 only when the result is right. There are at
least 3 ideas, each with a reason and from a page that was read, and none starts over the budget.
