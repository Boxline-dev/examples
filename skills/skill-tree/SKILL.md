---
name: skill-tree
description: Turn a topic's official docs into a skill graph - 8 to 20 small linked concept notes plus an entry SKILL.md - that an agent can traverse instead of reading one long file. Searches and reads the docs with Boxline. Usage /skill-tree <topic-or-url>, add --global for ~/.claude/skills.
---

# /skill-tree: a skill graph from docs

Build a graph of small, linked notes about one topic (a library, an API, a protocol) from its official docs.

## Usage

`/skill-tree <topic>` or `/skill-tree <docs-url>`; `--global` saves to `~/.claude/skills/`. Without input, show
the usage (`/skill-tree supabase-auth`, `/skill-tree https://docs.stripe.com/webhooks`) and stop.

## Boxline tools

The MCP server's `web_search` and `fetch_url`, or the CLI: `npx boxline search "<query>" --limit 8 --json` and
`npx boxline fetch <url>`.

## Steps

1. **Sources.** One search: `<topic> official documentation API reference`. Take 3 or 4 official pages (docs site,
   official repository, official announcements); skip tutorials, aggregators and forums. With a URL as input, use it
   and add 1 or 2 official pages. With none credible, ask for a URL.
2. **Read.** Fetch each as Markdown; skip one over 80,000 characters or one that fails. Keep the mechanisms, APIs,
   patterns, workflows, design decisions, security notes and pitfalls.
3. **Concepts.** 8 to 20 atomic notes, each one of: a mechanism, a pattern, a constraint, a workflow, a design
   decision. No two notes on the same thing; split one that would pass 150 lines.
4. **Notes.** One Markdown file per concept, 30 to 150 lines:

   ```markdown
   ---
   title: <Concept>
   description: <one line an agent can read without opening the file>
   links: [other-note, another-note]
   ---

   <Prose with [[wikilinks]] inside sentences: "Policies read the user from [[jwt-claims]] …", not "Related: …">
   ```

   Every note links to at least one other, and is linked from at least one. Folders only for 3 or more notes that
   belong together.
5. **Entry point.** `SKILL.md`, so the folder loads as a skill:

   ```markdown
   ---
   name: <topic>
   description: <what the graph covers and when to use it>
   ---

   # <Topic>: skill graph

   <One paragraph on the domain.>

   ## Areas
   - [[folder/]]: <what it covers>
     - [[note]]: <one line>
   - [[note]]: <one line>

   ## Most connected
   - [[note]] links <area> and <area>; most paths pass through it

   ## Gaps
   - <what the sources did not cover>

   ## Sources
   - <url> (read <YYYY-MM-DD>)
   ```

6. **Save** to `.claude/skills/<topic>/` (or `~/.claude/skills/<topic>/`); ask before replacing an existing folder.
7. **Print the tree**: `<topic> (<n> notes, <m> links)`, then each folder and note with its links, and where it was saved.

## Rules

- Only what the sources say; no invented APIs.
- At most 20 notes. Clear beats complete.
- Public documentation only. No emojis.
