# Accessibility check

Run the axe-core accessibility scan on a page in the session's browser and list the issues, worst first. The shell fetches axe-core inside the machine; Playwright runs it in the page.

| | |
|---|---|
| Uses | `exec` (curl), `files.readText`, Playwright over CDP (`evaluate`) |
| Needs | a plan with shell sessions; no model |
| Site | your page; the default is books.toscrape.com. The runner uses its stand-in page (an image without alt text, a field without a label, a button without a name) |
| Output | `output/issues.json` |

**Inputs** (environment variables):

- `PAGE_URL`: the page to scan (default `https://books.toscrape.com/`).

## Run it

Put your API key in the environment (`export BOXLINE_API_KEY=bxl_…`, or copy `.env.example` to `.env` and run
`set -a; . ./.env; set +a`). `BOXLINE_API_URL` points the SDK at another API (default `https://api.boxline.dev`).

Node 18 or newer:

```bash
npm install @boxline/sdk playwright-core tsx
npx tsx node/index.ts
```

Python 3.9 or newer:

```bash
pip install boxline-sdk playwright
python python/main.py
```

Both write to `output/` (`OUTPUT_DIR` picks another folder) and release their sessions when they finish.

## The result check

`npx tsx check.ts output` reads what the example wrote and exits with 0 only when the result is right. The issues are sorted worst first; on the stand-in, image-alt, label and button-name are found, critical first.

