# News to drafts

Follow a few blogs or news pages and, each run, turn what is new since the last run into drafts for a person to review:
a newsletter (Markdown and HTML) and one short social post per item, each with its source link. Nothing is sent and
nothing is posted.

| | |
|---|---|
| Uses | `extract` over the index pages (the posts they list), `extract` over the new posts |
| Needs | a model on the API (no model key of your own) |
| Site | your sources' index pages (default: the GitHub changelog); the runner uses a stand-in blog |
| Output | `output/newsletter.md`, `output/newsletter.html`, `output/posts.json`, `output/result.json` |

How it works: one call lists the posts on your index pages (relative links are resolved against the page that lists
them), the ones not seen before are read in a second call (a summary with the most concrete detail, who should care,
and a plain post of at most 220 characters), and the drafts are laid out by the code, so every item keeps its own link.
The newsletter starts with a `DRAFT` note and every post has `"draft": true`.

Drafts, not automation: send the newsletter with your mailing tool to people who subscribed, and post what you have
read and agree with, under your own name.

**Inputs** (environment variables): `SOURCES`, `MAX_ITEMS` (default 8), `STATE_DIR` (keep it between runs), `RUNS`,
`INTERVAL_SECONDS`.

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

Both write to `output/` (`OUTPUT_DIR` picks another folder).

## The result check

`npx tsx check.ts output` reads what the example wrote and exits with 0 only when the result is right. Every post is a
draft of at most 280 characters ending with its source link, the newsletter links every item and is marked as a draft.
On the runner's stand-in blog: round 1 drafts the 3 posts there, round 2 only the 2 added since, and the drafts keep
their own facts (Osaka, $0.017).
