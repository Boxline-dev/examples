---
name: learn
description: Learn a library, framework or API from its current official docs and save it as a Claude Code skill (.claude/skills/<topic>/SKILL.md), so later work uses today's APIs instead of stale training data. Searches and reads the docs with Boxline. Usage /learn <topic>, /learn batch <topic> <topic> …, add --global for ~/.claude/skills.
---

# /learn: a skill from today's docs

Search for a topic's official documentation, read it in a real browser (Boxline), and write a skill from it.

## Usage

- `/learn <topic>`: one topic, read in depth (3 to 5 pages).
- `/learn batch <topic> <topic> …`: several topics, quickly (2 pages each).
- `--global`: save to `~/.claude/skills/` instead of the project's `.claude/skills/`.

Without a topic, show the usage with examples (`/learn hono`, `/learn batch zod drizzle-orm`) and stop. Topic names
become kebab-case folder names.

## Boxline tools

- The Boxline MCP server: `web_search` (with `fetch` for the top pages as Markdown), `fetch_url`.
- Or the CLI (`BOXLINE_API_KEY` set, or `npx @boxline/cli login`):

  ```bash
  npx @boxline/cli search "<topic> official documentation" --limit 8 --json
  npx @boxline/cli search "<topic> official documentation getting started" --limit 5 --fetch 2 --json   # results and pages in one call
  npx @boxline/cli fetch <url>                                                                         # Markdown
  ```

## Steps

1. **Find the sources.** One search per topic: `<topic> official documentation`; one more for the API reference
   when the first finds none. Prefer the official docs site, then the official GitHub repository (README, docs
   folder), then official announcements. Skip tutorials, aggregators, forums and Q&A sites. Pick 3 to 5 pages (batch:
   2). With none credible, ask the user for a URL.
2. **Read them.** Fetch each as Markdown. Skip a page over 80,000 characters or one that fails; do not retry. Note
   each page's date read. Keep: installation, core concepts, the main APIs with signatures, common patterns with
   code, version notes, warnings.
3. **Write the skill.** In the format below; under 300 lines (batch: 200). Imperative ("Use X to …"). Version numbers
   when the docs give them. Where sources disagree, say so.
4. **Save it** to `.claude/skills/<topic>/SKILL.md` (or `~/.claude/skills/…` with `--global`). If it exists, say so
   and ask before replacing it.
5. **Report**: the skill's name, the sources read, where it was saved. In batch mode one line per topic, then
   `N/M skills written`.

## Format

```markdown
---
name: <topic-in-kebab-case>
description: <What it is and when to use this skill, with the words that should trigger it. At most 1024 characters.>
---

# <Topic>

<What it is and when to use it: 1 to 3 sentences. Version: …>

## Quick start
<Install and the smallest working example>

## Core concepts

## Common patterns
<Short code examples>

## API reference
<The main functions, methods or endpoints, with signatures> (skip in batch mode: link the reference instead)

## Gotchas

## Sources
- <url> (read <YYYY-MM-DD>)
```

## Rules

- Only what the sources say. Never invent an API, option or behavior; a gap is a gap.
- `name`: lowercase letters, digits and hyphens, at most 64 characters.
- Public documentation only; no pages behind a sign-in.
- No emojis.
