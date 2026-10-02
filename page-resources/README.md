# Page resources

Open a page in a cloud browser and list everything it loads, taken from the session's own network log: requests and
bytes by type and by domain, the third parties, what failed, and the slowest and heaviest requests, with a picture of
the page.

| | |
|---|---|
| Uses | a session, `goto` (until the network is quiet), `screenshot`, the session's network events (`data.bytes`) |
| Needs | any plan; no model |
| Site | your page; the default is books.toscrape.com (a demo shop); the runner uses a stand-in page |
| Output | `output/report.md`, `output/result.json`, `output/page.png` |

Every finished request is one `network` event in the session's log with its URL, status, resource type, duration and
`data.bytes` (what came over the network, compressed, headers included); failed ones carry the reason. "Third party"
means another site than the page's (by its last two domain labels, three for endings like `co.uk`).

**Inputs** (environment variables): `PAGE_URL`.

## Run it

Put your API key in the environment (`export BOXLINE_API_KEY=bxl_…`, or copy `.env.example` to `.env` and run
`set -a; . ./.env; set +a`). `BOXLINE_API_URL` points the SDK at another API (default `https://api.boxline.dev`).

Node 18 or newer:

```bash
npm install @boxline/sdk tsx
npx tsx node/index.ts
```

Python 3.9 or newer:

```bash
pip install boxline-sdk
python python/main.py
```

Both write to `output/` (`OUTPUT_DIR` picks another folder).

## The result check

`npx tsx check.ts output` reads what the example wrote and exits with 0 only when the result is right. The page
loaded, a document request and transferred bytes were counted, and the picture and report exist. On the runner's
stand-in page: documents, stylesheets, scripts and images are all counted, the 320 KB hero image is the heaviest
request, the script the page waits 1.5 s for is among the slowest, the missing image is a 404 failure, and example.com
is the third party.
