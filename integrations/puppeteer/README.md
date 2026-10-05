# Puppeteer with Boxline

Connect Puppeteer to a Boxline session's browser and use it as usual. `puppeteer-core` is enough: nothing is downloaded or launched on your computer. No AI and no model cost.

`puppeteer.connect({ browserWSEndpoint: session.connectUrl, defaultViewport: null })`; `defaultViewport: null` keeps the session's own viewport. Stop the session, then `browser.disconnect()`.

**Needs:** any plan. **Site:** books.toscrape.com or quotes.toscrape.com, demo sites made for scraping practice.

**Environment:** `BOXLINE_API_KEY` (and `BOXLINE_API_URL` for another API).

## Run it

Node 22 or newer, in `node/`:

```bash
cd node
npm install && npx tsx index.ts
```

The packages are pinned in the folder's own `package.json` / `requirements.txt`. The example writes to
`output/` (`OUTPUT_DIR` picks another folder) and stops its session when it finishes.

## The result check

`npx tsx check.ts output` reads what the example wrote and exits with 0 only when the result is right. It checks that Puppeteer clicked into the Poetry category, read all its books with prices (the same as the site's own page), and saved its screenshot.
