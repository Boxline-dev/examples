# Weather in 3 cities

Open the same weather page through residential proxies in New York, London and Tokyo, with the browser in "realistic" mode (its clock and language follow the proxy), and compare the local weather and time.

| | |
|---|---|
| Uses | sessions with `proxy: {type: "residential", country, city}` and `browser: {mode: "realistic"}` |
| Needs | a plan with residential proxies and the realistic browser (proxy traffic counts against the allowance) |
| Site | wttr.in (weather for the place a request comes from) |
| Output | `output/result.json`: one row per city |

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

`npx tsx check.ts output` reads what the example wrote and exits with 0 only when the result is right. Each browser's time zone and wttr.in's place match the proxy's city.

