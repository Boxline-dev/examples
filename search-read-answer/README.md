# Search, read, answer

Search the web, open the top results in a sandboxed browser, and answer the question from those pages with their addresses as sources.

| | |
|---|---|
| Uses | `search` with `fetch: 3` (the top pages as Markdown), `extract` with several `urls` and a schema |
| Needs | a plan with web search (Free: 100 searches a month) and a model on the API |
| Site | whatever the search finds; the query goes to the search provider (Brave), so keep personal data out of it |
| Output | `output/result.json`: the results, the answer and its sources |

**Inputs** (environment variables):

- `QUESTION`: your question (default `In what year was the Python programming language first released?`).

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

`npx tsx check.ts output` reads what the example wrote and exits with 0 only when the result is right. There are at least 3 results, the answer is there (for the default question: 1991), and every source is one of the pages that were read.

