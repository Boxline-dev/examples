# Chat with a page

Open a page once in a cloud browser, then ask questions about it in the terminal. Each answer is read from the page
that is open in the session, takes the chat so far into account, and quotes the words on the page it is based on.
When the page does not say, the answer says so instead of guessing.

| | |
|---|---|
| Uses | a session, `goto`, `content`, the `extract` action on the open page |
| Needs | a model on the API (no model key of your own) |
| Site | a books.toscrape.com product page (a demo shop), or any page you give it |
| Output | `output/result.json` (the questions, answers and quotes), `output/page.md` (the page as Markdown) |

**Inputs** (environment variables):

- `PAGE_URL`: the page to chat about (default `https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html`).
- `QUESTIONS`: questions separated by `|` to answer without typing (the runner uses this); without it, type your
  questions and `exit` to stop.

The session stays open while you chat (it ends after 5 idle minutes, at most 15 minutes in all), so the page is
loaded once and every question reads the same page, scripts and all.

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

`npx tsx check.ts output` reads what the example wrote and exits with 0 only when the result is right. Every answer
the page supports quotes words that are really in `page.md`; for the default page and the runner's three questions:
the price is £51.77, 22 are in stock, and the publisher's phone number is reported as not on the page.
