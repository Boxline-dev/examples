# Status page watch

Watch the official status pages of the services you depend on, and get a chat message when something changes: a
component degraded or back to normal, an incident opened or resolved. Every page is read into the same shape whatever
its format (overall state, components, open incidents), and each alert comes with a screenshot of the page.

| | |
|---|---|
| Uses | `extract` over all the pages in one call (a fixed scale of states), `screenshot` |
| Needs | a model on the API (no model key of your own); a Slack-style webhook for chat alerts |
| Site | the services' own status pages (default: GitHub and npm); the runner uses stand-in status pages |
| Output | `output/alerts.md`, `output/<page>-<round>.png` for each change, `output/result.json` |

States are mapped onto one scale (operational, degraded, partial_outage, major_outage, maintenance, unknown), so the
comparison with the last run is exact and a page whose only change is its "last updated" time stays quiet. Read the
services' official status pages (or their status APIs); third-party outage-report sites have their own terms.

**Inputs** (environment variables): `PAGES`, `SLACK_WEBHOOK_URL`, `STATE_DIR` (keep it between runs), `RUNS`,
`INTERVAL_SECONDS`. For a schedule, run it from cron with a kept `STATE_DIR`.

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

`npx tsx check.ts output` reads what the example wrote and exits with 0 only when the result is right. The first round
reads every page as a baseline. On the runner's stand-in pages, in round 2: Acme's webhooks are reported as
"operational → degraded" with the new incident and a partial outage, a screenshot is saved, the other page (only its
timestamp changed) stays quiet, and one alert reaches the stand-in chat webhook.
