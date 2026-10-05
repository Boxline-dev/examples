# Research a question

An agent searches the web, reads several sources in its browser, and answers with citations.

| | |
|---|---|
| Uses | `agent.run` (the agent's `web_search` tool and its browser), `agent.stream` |
| Needs | a plan with web search and a model on the API |
| Site | whatever the agent finds |
| Output | `output/result.json`: the answer, its sources, the searches and the pages opened |

**Inputs** (environment variables):

- `QUESTION`: your question (default `When was the James Webb Space Telescope launched, and where does it orbit?`).

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

`npx tsx check.ts output` reads what the example wrote and exits with 0 only when the result is right. The agent searched, cites at least two sources and opened each of them; for the default question the answer has 2021 and L2.

