# Playwright with Boxline

Connect Playwright to a Boxline session's browser over CDP and use it as usual: the session's context and page, locators, a route that sees every request, a screenshot. No AI and no model cost.

`chromium.connectOverCDP(session.connectUrl)` (Node) / `p.chromium.connect_over_cdp(session.connect_url)` (Python). `playwright-core` is enough in Node, and no `playwright install` is needed: the browser runs in the session.

**Needs:** any plan. **Site:** books.toscrape.com or quotes.toscrape.com, demo sites made for scraping practice.

**Environment:** `BOXLINE_API_KEY` (and `BOXLINE_API_URL` for another API).

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
`output/` (`OUTPUT_DIR` picks another folder) and releases its session when it finishes.

## The result check

`npx tsx check.ts output` reads what the example wrote and exits with 0 only when the result is right. It checks that Playwright read the first 3 quotes (Einstein first) with locators, clicked Next to page 2 (Marilyn Monroe), saw the page's requests in a route, and saved its screenshot.
