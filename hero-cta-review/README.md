# Hero CTA review

Does your landing page's main call to action work? A computer-use agent looks at the page the way a visitor does and
picks the hero's main button; then that button is measured in the page, its link is checked, and a short critique
says what to change.

| | |
|---|---|
| Uses | a session, an agent run in mode `computer` (screenshots, it only looks), `evaluate` (`measure-cta.js`), `fetch`, `extract` |
| Needs | a model with a computer-use tool on the API (no model key of your own) |
| Site | your landing page; the default is Firefox's page on mozilla.org; the runner uses a stand-in landing page |
| Output | `output/review.md`, `output/hero.png`, `output/result.json` |

Seeing and measuring are split on purpose: the agent judges like a person (which button stands out, what competes
with it), and the page gives exact numbers for that element (text contrast against WCAG AA, size, whether it is above
the fold, its accessible name), so the critique rests on facts. The link is opened in a sandboxed browser to check it
leads somewhere.

**Inputs** (environment variables): `PAGE_URL`.

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

`npx tsx check.ts output` reads what the example wrote and exits with 0 only when the result is right. A CTA was
identified, measured and criticised, with a screenshot. On the runner's stand-in landing page: the agent picks
"Start free trial", its white-on-light-blue text is measured at about 1.7:1 (a failure), it sits above the fold and
leads to the sign-up page, and a suggestion fixes the colour.
