# Bring your own model

Boxline gets the page (rendered in a real browser, scripts run, as clean Markdown); your own model turns it into JSON,
with your own key. Any OpenAI-compatible endpoint works: OpenAI, Fireworks, Together, Groq, or a model on your
machine with Ollama or vLLM. One HTTP request, no vendor SDK.

| | |
|---|---|
| Uses | `fetch` (Markdown), then your model's `/chat/completions` |
| Needs | any plan; your own model endpoint and key (`MODEL_API_KEY`, or `OPENAI_API_KEY`) |
| Site | a books.toscrape.com product page (a demo shop), or your page |
| Output | `output/result.json` (the product, the model, the tokens your provider billed) |

Use it when you must keep model calls under your own account (contracts, data rules, a model you fine-tuned, a model
that runs locally) and still want pages rendered like a browser does. The request asks for a strict JSON Schema; an
endpoint that does not support that answers 400, and the example retries in plain JSON mode with the schema in the
prompt. The page's text goes in as data: the system message tells the model not to follow instructions in it.

**Inputs** (environment variables): `MODEL_BASE_URL` (default OpenAI), `MODEL_API_KEY` or `OPENAI_API_KEY`, `MODEL`
(default `gpt-6-luna`), `PAGE_URL`.

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

`npx tsx check.ts output` reads what the example wrote and exits with 0 only when the result is right. The model's
JSON has the schema's shape and the provider reported its tokens; for the demo page: "A Light in the Attic", £51.77,
22 in stock.
