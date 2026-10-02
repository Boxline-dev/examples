# Site to RAG chunks

Turn a site (or one page) into chunks ready for an embedding pipeline or a vector store: boilerplate removed, each
page cut at its headings and then into chunks within a token budget, every chunk with its source address, its heading
path and a ready-to-embed text that starts with that path.

| | |
|---|---|
| Uses | `crawl` (Markdown) |
| Needs | any plan with crawls; no model |
| Site | your docs; the default is the Playwright docs; the runner uses a stand-in docs site |
| Output | `output/chunks.jsonl` (one chunk per line), `output/result.json` |

**Boilerplate across pages:** a line that 60% or more of the pages repeat (navigation, footers, cookie notes) is
removed everywhere, which a one-page cleaner cannot tell from content. Headings are never removed. **Chunking:** a
section's paragraphs stay together while they fit the budget; a paragraph that is too long alone is cut at sentence
ends. Tokens are estimated at 4 characters each; use your embedding model's tokenizer if you need exact counts.

Each line of `chunks.jsonl`: `{id, url, title, headings, text, tokens, embedText}`. Embed `embedText` (it carries the
page and heading context) and store `url` with it to cite the source.

**Inputs** (environment variables): `SITE_URL`, `MAX_PAGES` (default 10; 1 for one page), `MAX_TOKENS` (default 300).

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

`npx tsx check.ts output` reads what the example wrote and exits with 0 only when the result is right. Every chunk is
within the budget, has a unique id, and its `embedText` ends with its text. On the runner's stand-in docs site: the
navigation and footer every page repeats are in no chunk, each page's own fact is in a chunk whose heading path is
[the page's title, its section], and the long advanced guide is cut into several chunks.
