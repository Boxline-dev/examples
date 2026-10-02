# Context pack

Squeeze a few pages into a small, cited context for a model's prompt. Each source gets a tag (`[S1]`, `[S2]`, …), a
summary, its key facts (each carrying its tag) and its main links, and the pack is cut to a token budget.

| | |
|---|---|
| Uses | `fetch` (the page text and its links), `extract` over the pages |
| Needs | a model on the API (no model key of your own) |
| Site | any pages; the default is two MDN pages on HTTP caching; the runner uses stand-in docs pages |
| Output | `output/pack.md` (paste it into a prompt), `output/pack.json`, `output/result.json` |

Every fact comes with a quote, and a fact whose quote is not on its page is left out, so the pack only says what its
sources say. Facts are ranked (essential, useful, detail); to meet the budget, details go first, then useful facts,
then links, from the last source back, and every source keeps at least its top fact. `QUESTION` focuses the facts on
what you will ask.

**Inputs** (environment variables): `URLS` (at most 10), `QUESTION`, `BUDGET` (tokens, default 1500).

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

`npx tsx check.ts output` reads what the example wrote and exits with 0 only when the result is right. The pack fits
the budget, every source has a tag and at least one fact, and every fact line ends with its source's tag. On the
runner's stand-in pages, each page's own fact (2.5 GB, 730 queues, the 3rd of the month) is under its own tag and no
other.
