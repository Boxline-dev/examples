# Update a session

**Give your AI agents the infrastructure they need: browsers, shells, storage and isolated machines.**

One call changes a running session: `session.update({ timeout: 600, rotateUrls: true })` gives it a longer life and fresh
signed URLs, and the session keeps running. This example creates a session for 5 minutes, updates it to 10, and shows
what changed: `expiresAt` moved by the extra five minutes, the old `connectUrl` and `liveUrl` stopped working, and the new
ones work.

| | |
|---|---|
| Uses | `sessions.create`, `session.update({ timeout, rotateUrls })`, Playwright over the connect URL, the live view URL |
| Needs | a plan whose longest session is 10 minutes or more (Free allows 15) |
| Site | none |
| Output | `output/result.json` (`expiresAt` and the timeout before and after, what the old and the new URLs do) |

`timeout` is the session's whole length, counted from its start, so changing 300 to 600 moves `expiresAt` by 300 seconds
(at most the plan's longest session; at least 60 s from now). `rotateUrls: true` makes every earlier `connectUrl`,
`liveUrl` and `terminalUrl` stop working and closes connections made with them; the answer carries the new ones. Another
API server may take a few seconds to forget an old URL, so the example tries for up to 20 seconds. Treat these URLs like
passwords: rotate them when one leaked, or when a link you shared should stop working.

The session is created with `keepAlive: true`: the example connects Playwright and disconnects again, and a browser-only
session without it stops 5 seconds after its last client leaves.

Settings that are fixed when a session is created (`browser`, `shell`, `viewport`, `profile`, `extensions`, `env`, ...)
are refused with `NotUpdatableError`. `rotateProxy: true` gets a new proxy IP, `captcha`, `blockAds` and `proxy` apply at once.

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

Both write to `output/` (`OUTPUT_DIR` picks another folder) and stop their session when they finish.

## The result check

`npx tsx check.ts output` exits with 0 only when the timeout went from 300 to 600 and `expiresAt` moved by 300 seconds
(within 5), the connect URL worked before the update, both URLs changed, the old connect URL was refused, the old live URL
answered 401, and the new live URL answered 200 and the new connect URL connected.

