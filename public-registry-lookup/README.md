# Public registry lookup

An agent finds a company in the UK's public company register (Companies House) and opens its page; `extract` then reads the record into JSON with a schema.

| | |
|---|---|
| Uses | `agent.run` and `agent.stream`, then `extract` with a schema |
| Needs | a model on the API |
| Site | find-and-update.company-information.service.gov.uk (public) |
| Output | `output/record.json` |

**Inputs** (environment variables):

- `COMPANY`: the company to look up (default `ARM LIMITED`).

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

`npx tsx check.ts output` reads what the example wrote and exits with 0 only when the result is right. The record is complete and matches its page; for ARM LIMITED: 02557590, active, incorporated in 1990, Fulbourn Road.

