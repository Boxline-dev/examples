# Save a login once

Sign in by hand in the live view once. The session saves its cookies and local storage into a profile when it ends, and later sessions start from it already signed in.

| | |
|---|---|
| Uses | `profiles.create`, sessions with `profile: {id, persist: true}` and `keepAlive`, the live view |
| Needs | a plan with profiles; no model |
| Site | your site (`SIGNIN_URL`, `CHECK_URL`). The runner uses its stand-in sign-in (password, then a code) and plays the person |
| Output | `output/result.json` with the profile's id (use it as `PROFILE_ID` in "My invoices") |

**You take part:** It prints the live view link and waits: sign in there, then press Enter.

**Inputs** (environment variables):

- `SIGNIN_URL`: your sign-in page (required).
- `CHECK_URL`: a page that shows you are signed in (for example `https://example.com/account`).
- `LOGIN_NAME`: the profile's name (for example `My site`).

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

`npx tsx check.ts output` reads what the example wrote and exits with 0 only when the result is right. On the stand-in, the site saw one sign-in (by the person), and a new session from the profile opened the account page signed in.

