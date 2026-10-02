# SEO and metadata audit

Check each page's title, meta description, headings, Open Graph tags (title, description, image), Twitter/X card, canonical link, `noindex`, page language and image alt texts, list what to fix, and have a model suggest a description for pages that have none.

| | |
|---|---|
| Uses | `crawl` with `format: "html"`, a small tag parser, `extract` for the suggestions |
| Needs | a model on the API (only for the suggested descriptions) |
| Site | your site; the default is books.toscrape.com. The runner uses its stand-in: one page with six problems and one clean page |
| Output | `output/report.json`: each page's tags and fixes |

**Inputs** (environment variables):

- `SITE_URL`: the start page (default `https://books.toscrape.com/`).
- `MAX_PAGES`: how many pages at most (default `10`).

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

`npx tsx check.ts output` reads what the example wrote and exits with 0 only when the result is right. On the stand-in, all nine problems of /seo are found (long title, no description, 2 H1, no og:description, no og:image, no twitter:card, noindex, no canonical, an image without alt), /seo/about is clean, and the suggested description is a short sentence about the page.

