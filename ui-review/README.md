# UI review

A design check of a page from what the browser actually renders, at desktop width and at phone width, with
screenshots and the top fixes in plain words.

| | |
|---|---|
| Uses | two sessions (1280 and 375 pixels wide), `evaluate` (`measure.js` in the page), `screenshot`, `extract` for the fixes |
| Needs | a model on the API (no model key of your own) |
| Site | your page; the default is books.toscrape.com; the runner uses a stand-in page with known problems |
| Output | `output/review.md`, `output/desktop.png`, `output/phone.png`, `output/result.json` |

What is measured, from the computed styles: the colour palette, the fonts and text sizes in use, every piece of text
whose contrast with its background fails WCAG AA (4.5:1, or 3:1 for large text; computed, not guessed), images
without alt text, skipped heading levels, and at phone width whether the page scrolls sideways (and which element
makes it) and tap targets smaller than 24 × 24 pixels (WCAG 2.5.8). A model then turns those measurements into a short
summary and up to 6 concrete fixes; it is given the numbers, so it does not have to guess them from pixels.

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

Both write to `output/` (`OUTPUT_DIR` picks another folder) and release their sessions when they finish.

## The result check

`npx tsx check.ts output` reads what the example wrote and exits with 0 only when the result is right. Both widths were
measured, the palette and fonts are there, both screenshots are real PNGs and there are fixes. On the runner's stand-in
page: the grey "Free returns" line fails contrast at 1.9:1, the image without alt, the h1 → h3 skip, the 900-pixel
banner that makes a phone scroll sideways and the 20 × 18 button are all found, and a fix addresses the contrast.
