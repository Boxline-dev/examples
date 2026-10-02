# Visual uptime check

Two checks of your key pages:

1. **Load check**, no model: each page is opened in a real browser and timed.
   - up;
   - slow: over `SLOW_MS`;
   - down: an error status, or no page at all, with the reason (the name does not resolve, a certificate problem, the connection refused, no answer).
2. **Visual check**, on a schedule: a task opens each page, takes a screenshot, looks at it, and says whether it looks broken (an error message, a blank page, missing images). A page can load with 200 and still be broken.

A screenshot of each page is also saved for the record.

| | |
|---|---|
| Uses | `sessions.create` and `session.goto` (the load check), `tasks.create` with `output` and `schedule`, `tasks.run`, `agent.get` (the run's steps), `screenshot` |
| Needs | a plan with task schedules, and a model on the API |
| Site | your key pages (`PAGES`); the default is books.toscrape.com and quotes.toscrape.com. The runner uses its stand-in: one page fine, one that loads but shows an error, one down (503), one slow (6.2 s), and a host that does not exist |
| Output | `output/load.json` (the load check), `output/status.json` (the visual check) and `output/shots/N.png` |

**Inputs** (environment variables):

- `PAGES`: the pages, comma-separated (default `https://books.toscrape.com/,https://quotes.toscrape.com/`).
- `SLOW_MS`: a page that takes longer than this to load is slow (default `5000`).
- `SCHEDULE`: the cron (at most every 5 minutes; UTC) (default `*/15 * * * *`).
- `KEEP_SCHEDULE`: leave the schedule on at the end (for example `1`).

The example runs the task once right away instead of waiting for the schedule, then switches the schedule off unless `KEEP_SCHEDULE=1` (a check every 15 minutes costs a model run each time). Each run's result is in the task's run history (`tasks.runs`) and in the `task_run.finished` webhook.

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

`npx tsx check.ts output` reads what the example wrote and exits with 0 only when the result is right:

- the load check timed every page;
- the schedule's next run is the next quarter hour, and the task took screenshots;
- on the stand-in, the load check finds the fine page and the page with the error up, the 503 page down, the 6.2 s page slow, and the missing host down with Chrome's reason;
- the visual check finds the page with the error broken, the 503 page and the missing host down, and the other two fine;
- every saved screenshot is a PNG (4, as the missing host has none).

