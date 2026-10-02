# Dark pattern review

Two parts:

1. An agent goes through a checkout flow up to the last step before anything is bought, and points out confusing or deceptive steps (hidden costs, pre-ticked options, fake urgency, a hard way back).
2. A page scan of each page the agent went through (or the pages you give):
   - the browser measures what is there: boxes ticked in advance, countdowns that start again when the page is reloaded, fees that no earlier page showed, small print about money or renewals, and the wording of a pop-up's choices;
   - a model sorts what it finds into categories: urgency, scarcity, sneaking, hidden costs, confirmshaming, forced continuity, obstruction, misdirection, forced action;
   - every pattern quotes the page, and a quote that is not on the page is set aside, not reported.

| | |
|---|---|
| Uses | `agent.run` with `sessionId`, `agent.stream`, `session.goto`, `session.evaluate` (`scan.js`), `session.extract` with a schema |
| Needs | a model on the API |
| Site | saucedemo.com, a demo shop made for testing (it shows its demo sign-in on the page); the runner also scans its stand-in deals page and checkout, which have six known patterns |
| Output | `output/review.md` (the agent's review), `output/patterns.md` (the scan) and `output/result.json` (pages, measurements, patterns) |

**Inputs** (environment variables):

- `TASK`: review your own flow (say where to stop).
- `PAGES`: pages to scan, comma-separated (default: the pages the agent went through, except one after an order).

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

- the agent reached saucedemo's last checkout step, did not place the order, and its review talks about costs;
- on the stand-in, the browser measured the ticked protection plan, the countdown that restarts on reload, the $6.83 fee first shown at checkout, the 9 px renewal terms and the pop-up's "No thanks, I prefer paying full price";
- at least 5 of the 6 known patterns were found, each quoted from the page and in a category that fits.

