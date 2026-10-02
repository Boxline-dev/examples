# Changelog between refs

Clone a repository into a session's shell, list the commits between two tags (or any two refs), and let an agent in
that session write the changelog from the history itself, grouped for readers, every line citing its commits.

| | |
|---|---|
| Uses | a shell session without a browser (`git clone`, `git log`), an agent run in that session with an output schema |
| Needs | shell sessions and a model on the API (no model key of your own) |
| Site | any git repository the machine can clone; the runner uses a stand-in repository with tagged history |
| Output | `output/CHANGELOG.md`, `output/result.json` (the commits, the changelog, what was cited) |

The commits in the range are listed by the example itself (`git log --no-merges FROM..TO`), so every hash the agent
cites is checked against them: a changelog line about a commit outside the release is caught. The agent reads the
history with `git log` and `git show` and is told not to change the repository; dependency bumps and chores are left
out unless they matter to users.

**Inputs** (environment variables): `REPO_URL`, `FROM`, `TO`.

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

`npx tsx check.ts output` reads what the example wrote and exits with 0 only when the result is right. Every item cites
commits, and every cited commit is in the range. On the runner's stand-in repository (v1.0.0..v1.1.0): the CSV export
and the webhooks are in, the VAT rounding fix is in, and the dark mode added after v1.1.0 is not.
