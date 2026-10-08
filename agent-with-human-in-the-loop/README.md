# Agent with a human in the loop

An agent that asks you when it is unsure (here: which of several books to pick), waits for your answer, then carries on.

| | |
|---|---|
| Uses | `agent.run`, `agent.stream` (handover steps, thoughts), `agent.resume` with a note |
| Needs | a model on the API |
| Site | books.toscrape.com (a demo shop) |
| Output | `output/result.json` |

**You take part:** When the agent asks, type your answer (for example "The cheaper one, please.").

**Inputs** (environment variables):

- `TASK`: your own task (tell it to ask you when unsure).

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

`npx tsx check.ts output` reads what the example wrote and exits with 0 only when the result is right. The agent asked at least once and then reported the book the answer chose, checked against the shop's own page.

