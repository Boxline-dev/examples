# Hand over for a code

The AI signs in with your username and a password kept in the project's secrets; when the site asks for a code sent by SMS or an app, it pauses and asks you, then types the code and carries on. The run names the secret (`secrets: ["SIGNIN_PASSWORD"]`) and the model only ever sees `%SIGNIN_PASSWORD%`.

| | |
|---|---|
| Uses | `secrets.create` (the password, limited to the sign-in site with `origins`), `agent.run` with `secrets` and `variables`, `agent.stream`, `agent.handBack` |
| Needs | a plan with project secrets, and a model on the API |
| Site | your sign-in page (`SIGNIN_URL`). The runner uses its stand-in (password, then a 6-digit code) and types the code |
| Output | `output/result.json` |

**You take part:** When the AI asks, type the code the site sent you.

**Inputs** (environment variables):

- `SIGNIN_URL`: your sign-in page (required).
- `SITE_USERNAME`: your username (required).
- `SITE_PASSWORD`: your password, stored into the project secret the first time (keep it in the environment, never in code; later runs need only the secret).
- `SECRET_NAME`: the project secret's name (default `SIGNIN_PASSWORD`).

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

`npx tsx check.ts output` reads what the example wrote and exits with 0 only when the result is right. The site saw the password and then the code, the AI asked at least once and named the signed-in user, the run the API keeps never holds the password, and the secret's use by the run is in its audit log.

