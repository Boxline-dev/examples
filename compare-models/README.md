# Compare models

A small benchmark: the same browser tasks, each with its right answer written down beforehand (`tasks.json`), run by two or more models side by side. The example scores every run itself (no model judges) and prints each model's pass rate, time, steps and cost.

| | |
|---|---|
| Uses | `agent.models`, `agent.run` with `provider` and `model`, `agent.wait`, `agent.cancel` |
| Needs | a model provider on the API (two models from it, or any you name) |
| Site | three public demo and reference pages: books.toscrape.com, quotes.toscrape.com and RFC 2324 |
| Output | `output/result.json` (per model and per run), `output/runs.jsonl` (one line per run, with its steps), `output/summary.md` |

**Inputs** (environment variables):

- `MODELS`: the model ids to compare, comma-separated (default: the default model and the lowest-priced other one of its provider) (for example `gpt-6-sol,gpt-6-luna`).
- `TRIALS`: runs per task and model (default `1`).
- `TASKS_FILE`: your own tasks (default `tasks.json`).

**How it measures:**

- Every model gets the same prompt (`Start at <startUrl>. <instruction>`), at most 20 steps and 3 minutes per run.
- A task's models run at the same time, so they see the same web.
- A task passes when all its conditions hold: `answerContains` (a text in the final answer, any case), `answerMatches` (a regular expression) or `urlReached` (a page the run visited).
- A run that did not pass is sorted, never guessed:
  - `model_failure`: a wrong answer, no answer, or a step, cost or time limit;
  - `web_failure`: it ended on a bot wall or CAPTCHA page;
  - `platform_failure`: its session or the server failed;
  - `unclassified`: anything else.

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

`npx tsx check.ts output` reads what the example wrote and exits with 0 only when the result is right:

- there is one run per task, model and trial;
- every run has steps, tokens, time and cost;
- every score matches the task's right answer when recomputed from the answer;
- no run is a `platform_failure` or `unclassified`;
- with the shipped tasks, each model passed at least 2 of 3.

