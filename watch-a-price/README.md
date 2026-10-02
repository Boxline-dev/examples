# Watch a price

A task reads a product's price and stock into a fixed shape (an output schema), a schedule runs it every hour, and each finished run goes to your webhook receiver (`task_run.finished`), which verifies the signature and compares the price with the last one it saw.

| | |
|---|---|
| Uses | `tasks.create` with `output` and `schedule`, `tasks.run` and `waitForRun` (`wait_for_run`), `webhooks.create`, `verifyWebhook` (`verify_webhook`) |
| Needs | a plan with task schedules, and a model on the API; the receiver must be reachable by the API (public HTTPS; a local API with `WEBHOOKS_ALLOW_LOCAL=1` also delivers to this computer) |
| Site | a books.toscrape.com product page (a demo shop) |
| Output | `output/result.json` (the schedule, each run, each webhook and what the receiver made of it) and `output/last-price.json` (the receiver's memory) |

**Inputs** (environment variables):

- `PRODUCT_URL`: the product page (default `https://books.toscrape.com/catalogue/sapiens-a-brief-history-of-humankind_996/index.html`).
- `SCHEDULE`: the cron (at most every 5 minutes; UTC) (default `0 * * * *`).
- `RUNS`: how many runs to start right away (default `1`).
- `KEEP_SCHEDULE`: leave the schedule on at the end (for example `1`).

`receiver.ts` / `receiver.py` is the receiver. The example starts it in its own process and runs the task right away (`RUNS` times) instead of waiting for the schedule; since that receiver stops with the example, it switches the schedule off at the end unless `KEEP_SCHEDULE=1`. To keep watching, run the receiver on a public HTTPS address (`WEBHOOK_SECRET=whsec_… PORT=8787 npx tsx node/receiver.ts`) and point a webhook endpoint at it.

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

Both write to `output/` (`OUTPUT_DIR` picks another folder) and release their sessions when they finish.

## The result check

`npx tsx check.ts output` reads what the example wrote and exits with 0 only when the result is right. The schedule's next run is the next full hour, every run completed with an answer in the schema and the site's price, each sent a signed `task_run.finished` webhook with the same result, the receiver found the first price new and the second one unchanged, and the schedule was switched off at the end.

