# Ask a repository

Clone a git repository into a session's shell and let an agent answer your questions about it by reading the code
(`ls`, `grep`, `cat`, `git log`), not a web page about it. Every answer names the files it rests on, and the example
checks that those files exist.

| | |
|---|---|
| Uses | a shell session without a browser, `exec`, an agent run in that session with an output schema, files |
| Needs | shell sessions and a model on the API (no model key of your own) |
| Site | any git repository the machine can clone; the runner uses a stand-in repository |
| Output | `output/answers.md`, `output/result.json` (answers, files, the agent's tool steps, its run id) |

The agent works in the same session the repository was cloned into, and that session has no browser: it can only use
the shell, inside the machine. It is told not to change anything. Its answer is JSON (`output` schema): each question
with its answer and the files it read.

**Inputs** (environment variables): `REPO_URL` (default `https://github.com/expressjs/cors.git`) and `QUESTIONS`,
separated by `|`.

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

`npx tsx check.ts output` reads what the example wrote and exits with 0 only when the result is right. Every question
has an answer that names files, every named file exists in the clone, and the agent used the shell. On the runner's
stand-in repository: the tests use node:test, they check the home page ("Example Widgets"), /pricing and /about,
`STAGING_URL` must be set, and an answer cites `test/pages.test.mjs`.
