# Data collection map

What personal data a site's pages ask for, and where it goes: a starting point for a privacy review of your own site.

| | |
|---|---|
| Uses | a session (`goto` page by page, `evaluate` with `forms.js`), its network log, `exportCookies` and files |
| Needs | any plan; no model |
| Site | your site; the default is books.toscrape.com; the runner uses a stand-in site |
| Output | `output/map.md`, `output/result.json` |

It visits the start page and the pages it links to on the same site (up to `MAX_PAGES`), one after the other in the
same browser, and for each page lists its forms: the kinds of personal data their fields ask for (from each field's
type, `autocomplete`, name and label: email, phone, name, address, birth date, payment card, password, government id)
and where the form sends them, flagging another site. Across the visit it lists the third-party hosts the pages loaded
from (a list of well-known trackers is marked; `TRACKERS` adds yours) and the cookies the site set (from the
session's cookie export: HttpOnly or readable by scripts, Secure or not).

A map, not a legal assessment: use it to see what to document and what to ask your vendors.

**Inputs** (environment variables): `SITE_URL`, `MAX_PAGES` (default 5), `TRACKERS`.

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

`npx tsx check.ts output` reads what the example wrote and exits with 0 only when the result is right. Every form has
its target. On the runner's stand-in site: the sign-up and checkout pages are both read, email, phone, birth date and
card data are found, the card details posted to another site are flagged, the third-party script is listed as a
tracker, and the server's HttpOnly cookie and the script's cookie are both there.
