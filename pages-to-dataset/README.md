# Pages to dataset

Turn web pages into a dataset for fine-tuning or evaluation: clean text passages and question-answer pairs, split into
train and eval sets in JSONL. The pages come from your list of addresses, or from a web search.

| | |
|---|---|
| Uses | `fetch` (your addresses) or `search` with `fetch` (a query), `extract` over 10 pages per call |
| Needs | a model on the API (no model key of your own); web search for a query |
| Site | your pages, or what the search finds; the runner uses a stand-in docs site |
| Output | `output/train.jsonl`, `output/eval.jsonl`, `output/result.json` |

What it does to the pages:

1. **Cleans them:** lines most pages repeat (navigation, footers), link lists and what comes before each page's title
   are removed.
2. **Drops near-duplicates:** a paragraph sharing 80% or more of its 5-word shingles with one kept before is left out,
   so a notice copied onto several pages with a word changed lands in the dataset once.
3. **Cuts passages:** a page's paragraphs grouped up to `CHUNK_TOKENS`.
4. **Writes question-answer pairs:** `QA_PER_PAGE` per page about its most specific facts, each with the sentence that
   supports it. A pair whose evidence is not on its page is dropped.
5. **Splits:** by a hash of each record's id, so a record always lands in the same set run after run.

Records: `{id, type: "text", url, title, text, tokens}` and `{id, type: "qa", url, question, answer, evidence}`.

Use pages you may reuse this way: your own docs, or openly licensed content. A search's top pages belong to their
owners.

**Inputs** (environment variables): `URLS` or `QUERY`, `CHUNK_TOKENS` (default 200), `QA_PER_PAGE` (default 3),
`EVAL_SHARE` (default 0.2).

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

`npx tsx check.ts output` reads what the example wrote and exits with 0 only when the result is right. Train and eval
are both non-empty and share no record, and every record is complete. On the runner's stand-in docs site: the support
paragraph that two pages carry (one word apart) is kept once, the navigation and footer are in no record, and at
least 3 pages' own facts come back as answers.
