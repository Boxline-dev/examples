# GitHub profile summary

What a developer works with, measured instead of guessed: their public GitHub profile and repository list are read in
a cloud browser, then their top repositories are cloned in a session's shell and measured there (lines of code per
language, frameworks and libraries from the manifest files, CI, containers and infrastructure).

| | |
|---|---|
| Uses | `extract` over two pages, a shell session (`exec`, files) |
| Needs | shell sessions and a model on the API (no keys of your own) |
| Site | github.com (public profile and repositories only) |
| Output | `output/summary.md`, `output/result.json` |

How it works:

1. **In a sandboxed browser:** one `extract` call reads the profile and the repository list sorted by stars: name,
   bio, location, followers and each repository's name, address, description, language, stars and whether it is a
   fork.
2. **On the machine:** `stack.py` shallow-clones the top `TOP_REPOS` of the user's own repositories (forks left out) and
   counts non-empty lines per language by file type, reads `package.json`, `requirements.txt`, `pyproject.toml`,
   `go.mod`, `Cargo.toml`, `Gemfile` and `composer.json` for well-known frameworks, and notes GitHub Actions, Docker,
   Terraform and Make. Nothing runs on your computer.

**Inputs** (environment variables): `GITHUB_USER` (default `octocat`), `TOP_REPOS` (default 3).

Use it on public profiles for things like knowing a project's maintainers better or summing up your own work; it reads
what anyone can see and clones only public repositories.

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

`npx tsx check.ts output` reads what the example wrote and exits with 0 only when the result is right. Every measured
repository is the user's own (not a fork), at least one was cloned, lines of code were counted and the language shares
add up to 100%. For octocat: HTML and CSS, as their top repositories are web pages.
