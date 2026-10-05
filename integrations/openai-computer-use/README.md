# OpenAI computer use with Boxline

Your own loop with OpenAI's computer tool (Responses API, `{type: "computer"}`): the model looks at screenshots and answers with `computer_call`s; each action goes to the session unchanged through `session.computer()` (POST /v1/sessions/:id/computer), and the screen after it goes back to the model.

One `computer_call` can carry several actions: run them in order with `screenshot: false` on all but the last, and send one `computer_call_output` with the last screenshot. Use the same `maxWidth` on every call: the model's coordinates are read in the screenshot's pixels. The tool sees only the page (no address bar), so open the start page first. When OpenAI sends `pending_safety_checks`, a person confirms in the terminal; the loop never acknowledges one by itself.

**Needs:** any plan; your own OpenAI key. **Site:** books.toscrape.com or quotes.toscrape.com, demo sites made for scraping practice.

**Environment:** `BOXLINE_API_KEY`, `OPENAI_API_KEY` (your OpenAI key), `CUA_MODEL` (a model with the computer tool: gpt-6-sol, gpt-6-astra or gpt-6-luna; default `gpt-6-luna`), `START_URL` (the page the loop opens first; default `https://books.toscrape.com/`), `TASK` (your own task).

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

`npx tsx check.ts output` reads what the example wrote and exits with 0 only when the result is right. It checks that the model clicked through the site with the computer tool and named the cheapest Poetry book and its price, checked against the site's own page.
