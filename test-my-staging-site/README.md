# Test my staging site

Clone your repository in the session's shell, run its tests against your staging site, and open every page that failed in the session's browser for a screenshot.

| | |
|---|---|
| Uses | `exec` with `cwd` and `env` (git, npm), the actions API (`goto`, `screenshot`) |
| Needs | a plan with shell sessions; no model |
| Site | your repository (`REPO_URL`) and staging site (`STAGING_URL`). The runner serves a small repository of site tests and a stand-in staging site with one broken page |
| Output | `output/result.json` and `output/failures/N.png` |

**Inputs** (environment variables):

- `REPO_URL`: a repository you may clone (required); for a private one, a read-only token in the address, kept in the environment.
- `STAGING_URL`: the site its tests check (required); the tests get it as STAGING_URL.
- `TEST_COMMAND`: how to run the tests (default `npm test`).

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

`npx tsx check.ts output` reads what the example wrote and exits with 0 only when the result is right. On the stand-in, 2 tests passed and 1 failed, and the failing page (/staging/pricing, HTTP 500) was opened and screenshotted.

