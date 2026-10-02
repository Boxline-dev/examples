# Browser Use with Boxline

A Browser Use agent, on your own OpenAI key, drives a Boxline session's browser. Nothing is launched on your computer.

`Browser(cdp_url=session.connect_url, keep_alive=True)` and `Agent(task=..., llm=ChatOpenAI(...), browser=browser)`. Newer OpenAI models take only their default temperature: pass `temperature=None, frequency_penalty=None`. At the end, `await browser.stop()` (it disconnects without closing the browser), then release the session; releasing it first leaves Browser Use trying to reconnect.

**Needs:** any plan; your own OpenAI key; Python 3.11 or newer. **Site:** books.toscrape.com or quotes.toscrape.com, demo sites made for scraping practice.

**Environment:** `BOXLINE_API_KEY`, `OPENAI_API_KEY` (your OpenAI key: Browser Use calls OpenAI itself), `BU_MODEL` (the OpenAI model; default `gpt-6-luna`), `TASK` (your own task).

## Run it

Python 3.11 or newer, in `python/`:

```bash
cd python
pip install -r requirements.txt && python main.py
```

The packages are pinned in the folder's own `package.json` / `requirements.txt`. The example writes to
`output/` (`OUTPUT_DIR` picks another folder) and releases its session when it finishes.

## The result check

`npx tsx check.ts output` reads what the example wrote and exits with 0 only when the result is right. It checks that the agent finished, opened books.toscrape.com, and named the cheapest Poetry book and its price, checked against the site's own page.
