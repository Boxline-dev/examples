# Company research

Research a company on one topic: search the web, read the top pages in a cloud browser, and get structured findings
(an overview, the findings, key points and what is still open) where every key point names the page it comes from.

| | |
|---|---|
| Uses | `search`, `extract` over several pages with a schema |
| Needs | web search and a model on the API (no keys of your own) |
| Site | whatever the search finds |
| Output | `output/report.md` (with links to the sources), `output/result.json` |

**Inputs** (environment variables):

- `COMPANY`: the company (default `Mozilla`).
- `TOPIC`: what to find out about it (default `how it makes money`).

The search goes through the platform's search provider, so no search engine's pages are scraped. The query leaves
your computer: keep personal data out of it.

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

`npx tsx check.ts output` reads what the example wrote and exits with 0 only when the result is right. The findings
are about the company asked for, there are at least 3 key points, at least 2 pages were read, and every key point
cites a page that was really read. For the defaults, the findings mention Mozilla's search deals.
