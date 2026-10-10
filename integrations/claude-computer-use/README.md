# Claude computer use with Boxline

Your own loop with Claude's computer toolset (`computer_toolset_20260801`, Messages API, no beta): Claude looks at screenshots and answers with one `tool_use` block per action, named after it (`left_click`, `type`, …). Each goes to the session as `{action: <name>, ...input}` through `session.computer()` (POST /v1/sessions/:id/browser/computer), and the result goes back with `toolset_name: "computer"`.

The toolset takes no screen size: Claude's coordinates are in the pixels of the screenshots it gets, so use the same `maxWidth` on every call. A turn's actions run in order and stop at a failed one. The Claude 5.5 models (Opus, Sonnet, Haiku) take only this toolset. It sees only the page (no address bar), so open the start page first.

**Needs:** any plan; your own Anthropic key. **Site:** books.toscrape.com or quotes.toscrape.com, demo sites made for scraping practice.

**Environment:** `BOXLINE_API_KEY`, `ANTHROPIC_API_KEY` (your Anthropic key), `CUA_MODEL` (a Claude 5.5 model; default `claude-sonnet-5-5`), `START_URL` (the page the loop opens first; default `https://books.toscrape.com/`), `TASK` (your own task).

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

`npx tsx check.ts output` reads what the example wrote and exits with 0 only when the result is right. It checks that Claude clicked through the site with the computer tool and named the cheapest Poetry book and its price, checked against the site's own page.
