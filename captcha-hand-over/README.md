# CAPTCHA hand-over

Open a form behind a CAPTCHA, see the platform detect it, have a person solve it in the live view, then carry on and submit the form. With `captcha: "ask"` (the default) nothing is solved automatically. Only on sites you own or may automate.

| | |
|---|---|
| Uses | sessions with `captcha: "ask"`, `attention`, `onCaptcha` / `on_captcha`, `waitForHuman` / `wait_for_human`, `captcha` events |
| Needs | any plan; no model |
| Site | a form of your own site with a CAPTCHA (`FORM_URL`, required). The runner uses its stand-in form with a stand-in reCAPTCHA widget and plays the person |
| Output | `output/result.json` |

**You take part:** It prints the live view link when the CAPTCHA waits: solve it there; the example carries on by itself.

**Inputs** (environment variables):

- `FORM_URL`: your form with a CAPTCHA (required).
- `NAME`: what to type into its name field (default `Ada Lovelace`).

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

`npx tsx check.ts output` reads what the example wrote and exits with 0 only when the result is right. The CAPTCHA was detected and cleared (with the time it waited), and the form went through with the answer.

