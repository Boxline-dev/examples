---
name: harness
description: Try the everyday tasks in a project (install, test, build, lint, find the entry point, add a route, write a test), record every wrong assumption, check the main dependencies' current docs with Boxline, and write a CLAUDE.md and AGENTS.md made only of rules those failures earned. Can run the commands in a clean Boxline machine to find what a fresh checkout needs. Usage /harness [--quick|--full] [--clean-machine].
---

# /harness: a CLAUDE.md from real mistakes

Work in the current project, note where you went wrong, and write the rules that would have prevented it.

## Usage

- `/harness`: the 4 core tasks.
- `/harness --full`: all 8 tasks.
- `/harness --clean-machine`: also run install, test, build and lint in a fresh Boxline shell machine (see step 3).

## Steps

### 1. Learn the project

Read the manifest files (`package.json`, `pnpm-workspace.yaml`, `tsconfig.json`, `pyproject.toml`, `requirements.txt`,
`go.mod`, `Cargo.toml`, framework configs), the README, an existing CLAUDE.md or AGENTS.md, and the file tree
(`git ls-files | head -200`).

### 2. Try the tasks, and record each one

Core:
1. Run the tests (the command the project really uses).
2. Run the build.
3. Run the linter or formatter check.
4. Find the entry point and trace the architecture: where requests or commands start, the main folders.

With `--full`:
5. Add a small health route or function where this project would put it (then remove it).
6. Write one test for an important function the way the project's tests are written (then remove it).
7. Rename a helper file and fix its imports (then undo it).
8. Fix one type or lint error, and note the rules that apply.

For each, write down:

```
Task:
Result: worked / partly / failed
I assumed:
In fact:
Wrong commands tried:
The command that worked:
Where I looked first, wrongly:
Rule that would have prevented it:
```

Leave the user's code as it was: undo every change you made while trying.

### 3. A clean machine (with --clean-machine)

Your own machine hides what a fresh checkout needs (global tools, a filled `.env`, a cache). With the user's
agreement (it sends the project's committed files to their Boxline account), run the commands in a new machine:

```bash
git archive --format=tar.gz -o /tmp/project.tgz HEAD                 # committed files only: no .env, no node_modules
ID=$(npx @boxline/cli sessions create --shell --no-browser --timeout 1800 --json | node -pe 'JSON.parse(require("fs").readFileSync(0)).id')
npx @boxline/cli files put "$ID" project.tgz /tmp/project.tgz
npx @boxline/cli exec "$ID" -- 'mkdir p && tar xzf project.tgz -C p && cd p && <install command> && <test command>'
npx @boxline/cli exec "$ID" -- 'cd p && <build command>; cd p && <lint command>'
npx @boxline/cli sessions stop "$ID"
```

Record what failed there and not here: missing environment variables (names only), system packages, setup steps,
the Node or Python version. Each one becomes a rule.

### 4. Today's docs for the main dependencies

Pick the framework and the 2 to 4 core libraries (not small utilities). For each, find the docs page for the
installed version and read it:

```bash
npx @boxline/cli search "<library> <major version> documentation" --limit 5
npx @boxline/cli fetch <docs-url>
```

(or the MCP server's `web_search` and `fetch_url`). Keep only what bears on a failure from step 2 or 3, or what
contradicts a common assumption (a renamed API, a new default, a removed option). Without Boxline set up, skip this
step and say so.

### 5. Write CLAUDE.md and AGENTS.md

If a CLAUDE.md exists, write `CLAUDE.harness.md` next to it and offer to merge, rather than replacing it.

```markdown
# CLAUDE.md

> Written by /harness on <YYYY-MM-DD>: <n> tasks tried, <n> mistakes, <n> rules.

## Project
- Stack: … · Entry point: … · Package manager: …

## Commands
- Install: `…` · Dev: `…` · Test: `…` · Build: `…` · Lint: `…`
(only commands that ran)

## Rules
### Files and imports
- <rule> (from: <task>)
### Tests
### Do not
- Do not <mistake>; <what to do instead>
### Dependencies
- <library> <version>: <what the current docs say that differs from habit> (<docs url>)
### A fresh checkout needs
- <env var names, system packages, steps> (from the clean machine)

## What was tried
| Task | Result | Main mistake |
|---|---|---|
```

`AGENTS.md`: the same rules in at most 50 lines, for any coding agent.

### 6. Report

Tasks tried, mistakes found, rules written, the files saved, and whether the clean-machine run and the docs check ran.

## Rules

- Every rule traces to a mistake you made, a clean-machine failure, or a current doc that contradicts habit. No
  generic advice.
- Never print, copy or commit secret values; environment variables by name only.
- CLAUDE.md under 150 lines, AGENTS.md under 50. No emojis.
