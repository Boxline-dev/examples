# LangChain with Boxline

Two LangChain tools backed by Boxline, given to a LangChain agent (`createAgent` / `create_agent`) on your own OpenAI key: `boxline_fetch` reads a page in a sandboxed browser, and `boxline_browser_agent` hands a whole browser task (clicking, typing, several pages) to a Boxline agent run.

`tool()` from `langchain` with a zod schema (Node) or `@tool` from `langchain.tools` (Python); `ChatOpenAI` with the Responses API (`useResponsesApi: true` / `use_responses_api=True`), which newer OpenAI models need for function tools.

**Needs:** any plan (the browser agent tool needs a model on the Boxline API); your own OpenAI key. **Site:** books.toscrape.com or quotes.toscrape.com, demo sites made for scraping practice.

**Environment:** `BOXLINE_API_KEY`, `OPENAI_API_KEY` (your OpenAI key, for the LangChain agent's model), `LC_MODEL` (the OpenAI model; default `gpt-6-luna`), `QUESTION` (your own question).

## Run it

Node 22 or newer, in `node/`:

```bash
cd node
npm install && npx tsx index.ts
```

Python 3.10 or newer, in `python/`:

```bash
cd python
pip install -r requirements.txt && python main.py
```

The packages are pinned in the folder's own `package.json` / `requirements.txt`. The example writes to
`output/` (`OUTPUT_DIR` picks another folder) and stops its session when it finishes.

## The result check

`npx tsx check.ts output` reads what the example wrote and exits with 0 only when the result is right. It checks that the LangChain agent called a Boxline tool and answered with the price and stock the demo shop shows.
