# Wiki race

**Give your AI agents the infrastructure they need: browsers, shells, storage and isolated machines.**

The old game: get from one Wikipedia article to another by clicking links only. An agent plays it in a real browser.
The example then judges the game without trusting the agent: it reads the pages the browser really visited from the
session's log, checks every hop against Wikipedia's API in the session's shell, and works out whether a shorter route
existed.

| | |
|---|---|
| Uses | `sessions.create` with `shell`, `session.goto`, `agent.run` in that session, `session.events` (the pages visited), `session.files`, `session.exec` (`verify_path.py`: the MediaWiki API) |
| Needs | a plan with shell sessions and agent runs |
| Site | [Wikipedia](https://en.wikipedia.org/) (any language), read at a person's pace; the API calls carry a user agent naming this example, as [Wikimedia's API etiquette](https://www.mediawiki.org/wiki/API:Etiquette) asks |
| Output | `output/route.md` (the route, hop by hop) and `output/result.json` (what the agent said, what was visited, the verdict) |

**Inputs** (environment variables):

- `START_URL`: the article to start from (default
  [Coffee](https://en.wikipedia.org/wiki/Coffee)).
- `TARGET`: the title of the article to reach (default `Moon`).

How the route is judged (`verify_path.py`):
- the route is the visited articles in order; going back to an earlier article cuts off the dead end after it;
- a hop A → B counts only when A's page links to B (redirects followed, as the browser follows them); a search page or
  a typed address breaks the chain, and so does any page of another site;
- the shortest possible route is 1 hop when the start links to the target, and 2 when one of the start's links links to
  it (the start's links intersected with the target's backlinks); otherwise 3 or more.

Cost: the agent reads whole articles, so a race costs about $1 of model use with the default model (two runs on
2026-10-03: 3 and 4 hops). A target close to the start, or `maxSteps` lower, costs less.

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

Both write to `output/` (`OUTPUT_DIR` picks another folder) and release their session when they finish.

## The result check

`npx tsx check.ts output` exits with 0 only when the browser reached the target, every hop of the route is a link on
its page, the agent never typed an address, and the route is no shorter than the shortest possible (a sanity check of
the verdict itself).

