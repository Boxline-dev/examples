# Security headers check

Which security headers a site sends, which are missing, and how its cookies are flagged; the redirect chain hop by hop; HSTS in detail (how many days, subdomains, preload); and how the site answers a request from another site (CORS), flagging an origin echoed back with credentials. `fetch` opens the page in a real browser; curl in the session's shell reads the raw headers.

| | |
|---|---|
| Uses | `fetch`, a shell-only session (`browser: false`), `exec` with `env` |
| Needs | a plan with shell sessions; no model |
| Site | your site; the default is books.toscrape.com. The runner uses its stand-in page (two headers present, a cookie without Secure or SameSite) |
| Output | `output/result.json` |

**Inputs** (environment variables):

- `SITE_URL`: the page to check (default `https://books.toscrape.com/`).

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

`npx tsx check.ts output` reads what the example wrote and exits with 0 only when the result is right. On the stand-in, the 301 in front of the page is the redirect chain, HSTS, CSP, Permissions-Policy and X-Frame-Options are missing, the two it sends are present, the cookie is HttpOnly, not Secure, without SameSite, and the CORS answer that echoes any origin with credentials is flagged.

