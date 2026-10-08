# Claude computer use with Boxline

Your own loop with Claude's computer tool (Messages API, beta `computer-use-2025-11-24`): Claude looks at screenshots and answers with `tool_use` blocks; each block's input goes to the session unchanged through `session.computer()` (POST /v1/sessions/:id/browser/computer), and the screen after it goes back as the tool result.

Tell Claude the screenshots' size (`display_width_px`, `display_height_px`) from a first `screenshot` action with the `maxWidth` you use on every call. `computer_20251124` is for Claude Opus 5 and Sonnet 5; Claude Haiku 4.5 uses `computer_20250124` with the beta `computer-use-2025-01-24`. The tool sees only the page (no address bar), so open the start page first.

**Needs:** any plan; your own Anthropic key. **Site:** books.toscrape.com or quotes.toscrape.com, demo sites made for scraping practice.

**Environment:** `BOXLINE_API_KEY`, `ANTHROPIC_API_KEY` (your Anthropic key), `CUA_MODEL` (a Claude model with the computer tool; default `claude-sonnet-5`), `START_URL` (the page the loop opens first; default `https://books.toscrape.com/`), `TASK` (your own task).

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
