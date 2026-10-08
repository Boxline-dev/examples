# Skills

Claude Code skills that use Boxline to read the web: copy a folder into your project's `.claude/skills/` (or into
`~/.claude/skills/` for every project) and call it with its slash command.

| Skill | Command | What it writes |
|---|---|---|
| [web](web/SKILL.md) | `/web <url>` | `web.md`: a site's pages, links, buttons, forms, flows and sign-in walls, for agents |
| [design](design/SKILL.md) | `/design <url>` | `DESIGN.md`: colors, fonts, type scale, spacing, radii, shadows, tokens and components, measured in a browser (`measure.mjs`) |
| [learn](learn/SKILL.md) | `/learn <topic>`, `/learn batch …` | A skill from a library's current official docs |
| [skill-tree](skill-tree/SKILL.md) | `/skill-tree <topic-or-url>` | A graph of 8 to 20 linked concept notes from the docs, with a `SKILL.md` entry point |
| [harness](harness/SKILL.md) | `/harness` | `CLAUDE.md` and `AGENTS.md` from the mistakes made trying a project's tasks, optionally in a clean Boxline machine |

## What they need

- A Boxline API key: `npx @boxline/cli login`, or `BOXLINE_API_KEY` in the environment.
- Either the Boxline MCP server (`web_fetch`, `web_search`, sessions) or the CLI (`npx @boxline/cli search|fetch|crawl`).
  `design` also runs `measure.mjs` with Node 18+ (`npx -y -p @boxline/sdk node measure.mjs <url>`).

```bash
cp -r skills/design .claude/skills/       # in your project
```

They read public pages only: crawls respect robots.txt, and nothing signs in, submits a form or gets past a CAPTCHA.

Adapted from the skills in [hyperbrowserai/examples](https://github.com/hyperbrowserai/examples) (MIT licence): `learn`
merges `learn` and `learn-batch`; `design` measures computed styles instead of a branding API; `skill-tree` saves a
`SKILL.md` entry point so the graph loads as a skill; `harness` can run the project in a clean machine.
