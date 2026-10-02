# Stagehand with Boxline

Stagehand's `act()` and `extract()` drive a Boxline session's browser. Stagehand calls the model itself, with your own OpenAI key.

Stagehand v3: `new Stagehand({ env: "LOCAL", localBrowserLaunchOptions: { cdpUrl: session.connectUrl }, model: { modelName, apiKey } })`, then `init()`, `act()`, `extract()` with a zod schema. Create the session with `keepAlive: true` and release it after `stagehand.close()`.

**Stagehand v4 does not work with Boxline sessions.** v4's `localBrowser.connect({ cdpUrl })` loads Stagehand's own browser extension from your computer's disk into the browser (`Extensions.loadUnpacked`), which cannot reach a remote browser (it fails with "File path cannot be resolved"), and that extension needs the `debugger` permission, which Boxline refuses for uploaded extensions (the browser's DevTools stay closed to extensions). Pin `@browserbasehq/stagehand` 3.x (3.7.3 here) with zod 3 (with zod 4, `act()` sends a schema OpenAI rejects).

**Needs:** any plan; your own OpenAI key. **Site:** books.toscrape.com or quotes.toscrape.com, demo sites made for scraping practice.

**Environment:** `BOXLINE_API_KEY`, `OPENAI_API_KEY` (your OpenAI key: Stagehand calls OpenAI itself), `STAGEHAND_MODEL` (the model, as provider/model; default `openai/gpt-6-luna`).

## Run it

Node 22 or newer, in `node/`:

```bash
cd node
npm install && npx tsx index.ts
```

The packages are pinned in the folder's own `package.json` / `requirements.txt`. The example writes to
`output/` (`OUTPUT_DIR` picks another folder) and releases its session when it finishes.

## The result check

`npx tsx check.ts output` reads what the example wrote and exits with 0 only when the result is right. It checks that act() opened the Poetry category and extract() read its first 5 books with the prices the site shows.
