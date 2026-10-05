# Vercel AI SDK with Boxline

Boxline's web search and page fetch as AI SDK tools. The model (your own OpenAI key) decides when to search and which pages to read.

`tool({ description, inputSchema, execute })` from `ai` (v7), `generateText({ model: openai(...), tools, stopWhen: isStepCount(8) })`; the tool calls are in `result.steps`.

**Needs:** a plan with web search for `boxline_search`; your own OpenAI key. **Site:** books.toscrape.com or quotes.toscrape.com, demo sites made for scraping practice.

**Environment:** `BOXLINE_API_KEY`, `OPENAI_API_KEY` (your OpenAI key: the AI SDK calls OpenAI itself), `AI_MODEL` (the OpenAI model; default `gpt-6-luna`), `QUESTION` (your own question).

## Run it

Node 22 or newer, in `node/`:

```bash
cd node
npm install && npx tsx index.ts
```

The packages are pinned in the folder's own `package.json` / `requirements.txt`. The example writes to
`output/` (`OUTPUT_DIR` picks another folder) and stops its session when it finishes.

## The result check

`npx tsx check.ts output` reads what the example wrote and exits with 0 only when the result is right. It checks that the model read the book's page with the Boxline fetch tool and answered with the price and stock the site shows.
