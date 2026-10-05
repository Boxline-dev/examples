# Download all images

The browser finds every image on a page, the shell downloads them into the workspace with the browser's cookies (so images behind a sign-in work too) and zips them, and the files API brings the zip back.

| | |
|---|---|
| Uses | Playwright over CDP, `exportCookies`, `files.write`, `exec` (curl, zip), `files.read` |
| Needs | a plan with shell sessions; no model |
| Site | your page; the default is books.toscrape.com. The runner uses its stand-in gallery of three images |
| Output | `output/images.zip` and `output/result.json` |

**Inputs** (environment variables):

- `PAGE_URL`: the page whose images to save (default `https://books.toscrape.com/`).

`download.sh` is the shell script both versions upload and run in the session.

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

Both write to `output/` (`OUTPUT_DIR` picks another folder) and stop their sessions when they finish.

## The result check

`npx tsx check.ts output` reads what the example wrote and exits with 0 only when the result is right. The zip holds as many images as the page has; on the stand-in, the three PNGs byte for byte.

