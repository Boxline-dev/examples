# Watch competitor pages

Check a few pages now and then, tell **real** changes (a price, a plan, a feature, an announcement) from noise (a
date, a counter, a rotating banner), and post the real ones to your chat.

| | |
|---|---|
| Uses | `fetch` (text, every check), `extract` with a schema (only when a page's text changed) |
| Needs | a model on the API (no model key of your own); a Slack-style incoming webhook if you want alerts in chat |
| Site | any pages; the runner uses stand-in pages that change between two rounds |
| Output | `output/result.json` (every round, page by page), `output/alerts.md`, the last facts in `STATE_DIR` |

How it decides: every check fetches the page as text in a sandboxed browser, which is cheap and needs no model. When
the text is the same as last time, nothing else happens. When it differs, a model reads the page into facts (prices,
features, announcements, keeping last time's wording for what did not change) and the code compares those facts
with the last ones. So the alert says exactly what changed ("price of Pro: $29 → $35", "feature added: SSO"),
and a page whose only change is a timestamp counts as noise and sends nothing.

**Inputs** (environment variables):

- `PAGES`: the pages to watch, separated by commas (default: the Node.js and Python release pages).
- `SLACK_WEBHOOK_URL`: your chat's incoming webhook (Slack's `{"text": …}` format, which many chat tools accept).
- `STATE_DIR`: where the last facts are kept (default `output/state`). Keep it between runs.
- `RUNS`, `INTERVAL_SECONDS`: check again in the same process (default: once). For a real schedule, run it from cron
  or a CI schedule with a kept `STATE_DIR`.

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

The first run saves a baseline; later runs report what changed since.

## The result check

`npx tsx check.ts output` reads what the example wrote and exits with 0 only when the result is right. The first
round saves a baseline for every page. On the runner's stand-in pages, in round 2: the pricing page is reported as
changed with exactly "Pro $29 → $35" and "SSO added", the blog (whose only change is a "readers online" counter) is
noise, and one alert with the new price reached the stand-in chat webhook.
