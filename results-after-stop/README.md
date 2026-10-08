# Results after stop

**Give your AI agents the infrastructure they need: browsers, shells, storage and isolated machines.**

A session's files outlive its machine. This example writes a folder of files in a shell session, stops the session, and
then lists the folder, reads two of its files and downloads the whole folder as one `.tar.gz`, all **without resuming
the session**: `files.list`, `files.readText` and `files.archive` answer from the workspace the session saved when it
stopped, so no machine runs and no machine time is billed.

| | |
|---|---|
| Uses | `sessions.create` with `browser: false, shell: true`, `session.files.write`, `session.exec`, `session.stop`, then `session.files.list`, `readText` and `archive` on the stopped session, `BrowserDisabledError` |
| Needs | a plan with shell sessions |
| Site | none |
| Output | `output/results.tar.gz` and `output/result.json` (the listing, what was read, the status of the session before and after) |

Also shown, because the session has no browser: its `liveUrl` and `connectUrl` are `null`, and a browser call
(`session.goto`) fails with `BrowserDisabledError` (409 `browser_disabled`).

The folder `results/` gets `summary.txt` and `data.csv` through the API, and `squares.json` and `logs/run.log` from
commands run in the machine (one of them runs Python). A `notes.txt` outside the folder shows that the archive of a folder
holds only that folder. Writes and commands on a stopped session are still refused (409 `session_not_running`): only reads
work there.

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

Both write to `output/` (`OUTPUT_DIR` picks another folder) and stop their session when they finish.

## The result check

`npx tsx check.ts output` exits with 0 only when the session was shell-only (`liveUrl` and `connectUrl` null, the browser call
refused with `BrowserDisabledError`), the files were read while the session was `STOPPED` and it was still `STOPPED` after
them, the listing and the two files read are what was written, and `results.tar.gz` really is a gzip tar holding exactly the
folder's four files with their contents (and nothing from outside it).

