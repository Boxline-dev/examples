# Top story discussion

Take today's most-voted Hacker News story, read the article and its discussion in a cloud browser, and sum up both:
what the article says, the viewpoints in the comments (each with a short quote and how many hold it), where people
agree and disagree, and what is still open.

| | |
|---|---|
| Uses | `extract` over the article and the discussion page |
| Needs | a model on the API (no model key of your own) |
| Site | Hacker News (its official search API for the front page; the story and its discussion page); the runner uses stand-in pages |
| Output | `output/discussion.md`, `output/result.json` |

The story: the most-voted one of the last `HOURS` hours that links to an article and has at least `MIN_COMMENTS`
comments (Ask HN posts have no article). The comments are data for the model: it quotes them and never follows what
they say.

**Inputs** (environment variables): `HOURS` (default 24), `MIN_COMMENTS` (default 20).

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

`npx tsx check.ts output` reads what the example wrote and exits with 0 only when the result is right. The article has
a summary and key points, the discussion at least two viewpoints, each with a quote. On the runner's stand-in front
page: the fresh, linked and discussed story is chosen (an Ask HN post, an older story and one with 5 comments are left
out), the article summary holds its fact, every quote is from a comment, the licence is the dispute and durability the
open question.
