# Daily tech digest

Collect today's stories from Hacker News and a few blogs, keep the ones on your topics, rank them, read the top
ones in a cloud browser and summarise them, then make a Markdown digest and a PDF slide deck and post the digest to
your chat. Run it every morning from cron or a CI schedule.

| | |
|---|---|
| Uses | a shell session (`setup`, `exec`, files), `extract` over several pages |
| Needs | shell sessions and a model on the API (no model key of your own); a Slack-style webhook if you want it in chat |
| Site | Hacker News' official search API and your feeds; the runner uses a stand-in set of stories |
| Output | `output/digest.md`, `output/deck.pdf` (a title slide and one per story), `output/result.json` |

What runs where:

1. **On the machine:** `collect.py` gathers the stories in the session's shell: Hacker News through its official
   search API (no page scraping), and each RSS or Atom feed. It writes `/workspace/items.json`.
2. **Here:** the example reads that file, keeps the stories whose titles have one of your topic words (and none of
   the excluded ones) and that are fresh enough, and ranks them: points per hour and comments for Hacker News, a
   steady score for blog posts, plus each topic word the title matches.
3. **In a sandboxed browser:** one `extract` call reads the top stories' pages and returns a summary (with the
   page's most concrete fact) and why it matters. A page that does not load, answers with an HTTP error, or is a PDF
   (`not_a_web_page`) is listed under "Could not be read" instead of being summarised.
4. **On the machine again:** `deck.py` builds the slide deck with fpdf2, which the session's `setup` installed.

**Inputs** (environment variables):

- `INCLUDE`, `EXCLUDE`: topic words, comma-separated (default `ai, llm, agent, agents, browser, security, database,
  open source`; none excluded).
- `TOP` (default 5, at most 10) and `MAX_AGE_HOURS` (default 48).
- `HN_URL`, `FEEDS`: the sources (default Hacker News' front page, the GitHub and AWS blogs).
- `SLACK_WEBHOOK_URL`: your chat's incoming webhook (Slack's `{"text": …}` format).

## Run it

Put your API key in the environment (`export BOXLINE_API_KEY=bxl_…`, or copy `.env.example` to `.env` and run
`set -a; . ./.env; set +a`). `BOXLINE_API_URL` points the SDK at another API (default `https://api.boxline.dev`).
Run from this folder (both versions upload `collect.py` and `deck.py` from it).

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

Both write to `output/` (`OUTPUT_DIR` picks another folder) and stop their session when they finish.

## The result check

`npx tsx check.ts output` reads what the example wrote and exits with 0 only when the result is right. Every story
has a real summary, the deck is a PDF with a title slide and one slide per story, and the digest exists. On the
runner's stand-in stories: exactly the 4 that match the topics and are fresh are chosen (a popular story off-topic,
an "Ask HN", a 100-hour-old story and an office move are left out), each summary holds the fact that is only on its
page, and the digest reached the stand-in chat webhook.
