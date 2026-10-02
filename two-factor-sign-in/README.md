# Two-factor sign-in

Keep a site's sign-in details on a saved login once (user name, password and the 2FA setup key), then an agent run signs in with `%login.username%`, `%login.password%` and `%login.otp%`: the platform makes the current 6-digit code at the moment it is typed. The model never sees any of them, and they are typed only on that site.

| | |
|---|---|
| Uses | `contexts.create`, `contexts.setLogin` (`set_login`), `agent.run` with `context`, `agent.stream` |
| Needs | a plan with saved login details, and a model on the API |
| Site | your sign-in page with an authenticator-app code (`SIGNIN_URL`). The runner uses its stand-in: a password page, then a real TOTP check |
| Output | `output/result.json` with the saved login's id and what it shows of its details |

**Inputs** (environment variables):

- `SIGNIN_URL`: your sign-in page (required).
- `SITE_USERNAME`: your user name or email.
- `SITE_PASSWORD`: your password (keep it in the environment, never in code).
- `SITE_TOTP_SECRET`: the site's 2FA setup key (base32) or otpauth:// link, as shown when you turn on an authenticator app.
- `CONTEXT_ID`: a saved login that already has details (then the three above are not needed).

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

`npx tsx check.ts output` reads what the example wrote and exits with 0 only when the result is right. On the stand-in, the site saw the password and then a valid 2FA code, the answer names the signed-in user, the run holds none of the user name, the password or the code, and the saved login shows only that it has a password and a 2FA key.

