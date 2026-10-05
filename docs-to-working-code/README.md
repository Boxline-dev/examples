# Docs to working code

**Give your AI agents the infrastructure they need: browsers, shells, storage and isolated machines.**

Give an agent an API's documentation and a goal. In one session it reads the docs in the browser, writes a Python
client in the shell, runs it, reads the errors and fixes it until the output is right. Then the example runs the script
again itself: what you get is code that has run against the real API, with its output beside it.

| | |
|---|---|
| Uses | `sessions.create` with `shell`, `session.goto`, `agent.run` in that session (browser and shell tools), `agent.wait` with an output schema, `session.exec`, `session.files` |
| Needs | a plan with shell sessions and agent runs |
| Site | [Frankfurter](https://frankfurter.dev/)'s docs by default, a free, open-source currency-rate API with no key (`DOCS_URL` and `GOAL` for any other API). The runner uses a made-up API that no model knows: a key header, a paged list, one date |
| Output | `output/client.py`, `output/client-output.json` and `output/result.json` (the agent's summary, the run's exit code and output, its steps) |

**Inputs** (environment variables):

- `DOCS_URL`: the documentation's first page (default Frankfurter's).
- `GOAL`: what the script must do, in words (default: the euro's rates for USD, GBP and JPY on a date, and their change
  over a month).

Why a browser and a shell in one session: API docs are often pages built with JavaScript (Swagger UI, Redoc, a docs
site), and the code has to run somewhere to be checked. Here the agent reads the docs where they render and runs the
client next to them, against the real API, in an isolated machine; the key it finds in the docs never leaves it.

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

`npx tsx check.ts output` exits with 0 only when `client.py`, run again by the example, exits with 0 and prints JSON,
and the agent read the docs in the browser and ran the script in the shell. On the stand-in's made-up API it also
compares the answer exactly (the highest high tide of each north station) and checks that the script sent the key and
followed the list's `next` cursor to its second page.

