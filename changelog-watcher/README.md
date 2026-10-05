# Changelog watcher

A task reads the newest released entry of a product's changelog into JSON (version, date, title, the changes and a one-sentence summary) every morning, and the example says whether it is new since the last time it looked. A new entry is posted to your team's chat.

| | |
|---|---|
| Uses | `tasks.create` with `output` and `schedule`, `tasks.run` and `waitForRun` (`wait_for_run`) |
| Needs | a plan with task schedules, and a model on the API |
| Site | the changelog to watch (`CHANGELOG_URL`, required). The runner uses its stand-in: an unreleased section first, then released entries |
| Output | `output/latest.json` and `output/last-seen.json`; a chat message when the entry is new |

**Inputs** (environment variables):

- `CHANGELOG_URL`: the changelog or release notes page (required).
- `SCHEDULE`: the cron (UTC) (default `0 8 * * *`).
- `KEEP_SCHEDULE`: leave the schedule on at the end (for example `1`).
- `SLACK_WEBHOOK_URL`: a Slack-style incoming webhook (`{"text": …}`) that gets new entries (optional).

The example runs the task once right away, then switches the schedule off unless `KEEP_SCHEDULE=1`. With the schedule on, compare in your `task_run.finished` webhook receiver (see "Watch a price").

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

Both write to `output/` (`OUTPUT_DIR` picks another folder) and stop their sessions when they finish.

## The result check

`npx tsx check.ts output` reads what the example wrote and exits with 0 only when the result is right. The schedule's next run is 08:00 UTC, and on the stand-in the entry is 2.4.0 (2026-09-24) with its 3 changes (the unreleased section skipped), reported as new on the first look and posted once to the stand-in's chat webhook with its version and every change.

