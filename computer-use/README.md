# Computer use

The agent drives the browser the way a person does, from screenshots with the mouse and keyboard (the model provider's own computer-use tool), instead of reading the page's structure.

| | |
|---|---|
| Uses | `agent.run` with `mode: "computer"`, `agent.models` (`supportsComputerUse`), `agent.stream` |
| Needs | a model with a computer-use tool on the API (Claude Opus 5, Sonnet 5, Haiku 4.5; GPT-6 Sol, Astra, Luna) |
| Site | books.toscrape.com (a demo shop) |
| Output | `output/result.json` with the answer and every screen action |

**Inputs** (environment variables):

- `TASK`: your own task (it starts on a blank page: name the site).

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

`npx tsx check.ts output` reads what the example wrote and exits with 0 only when the result is right. The run used the computer tool and found the cheapest Poetry book, checked against the shop's own page.

