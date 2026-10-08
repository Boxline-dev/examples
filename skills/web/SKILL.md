---
name: web
description: Map a live website into web.md, a guide coding agents can follow - every page, link, button, form, flow and auth wall, from the pages as a real browser renders them (Boxline). Use when asked to map, document or "learn" a website, or before automating one. Usage /web <url>.
---

# /web: a site map for agents

Write `web.md`: what a public website has and how to get around it, from its rendered pages.

## Boxline tools

Use whichever is there:

- The Boxline MCP server: `web_fetch` (format `html` or `markdown`), `web_search`.
- The `boxline` CLI (`npx @boxline/cli …`, with `BOXLINE_API_KEY` set or after `npx @boxline/cli login`).

## Steps

1. **The address.** Take the URL the user gave; add `https://` when it has no scheme.
2. **The pages.** Crawl the site (same host, robots.txt respected, at most 15 pages):

   ```bash
   npx @boxline/cli crawl <url> --limit 15 --format html -o .boxline-web
   ```

   With only the MCP server: `web_fetch` the start page as `html`, take its same-host links (no anchors, assets or
   duplicate addresses), and fetch up to 14 of them. A page that fails is skipped.
3. **Each page, from its HTML.** Record only what is there:
   - navigation: main menu, sidebar, breadcrumbs, footer links (label → address);
   - actions: buttons (their exact label), links that act as buttons, dropdowns, toggles, what opens a dialog;
   - forms: each field's label, name, type, required, autocomplete, and the form's method and action;
   - flows: sign-up, sign-in, search, checkout, multi-step forms, as numbered steps;
   - data: tables, lists, repeated cards, filters, sorting, pagination;
   - walls: pages behind a sign-in or paywall, cookie banners, CAPTCHAs.
4. **The map.** Routes and what each holds, how pages link, the main paths (home → pricing → sign-up), and the parts
   every page shares (header, footer).
5. **Write `web.md`** in the project root in the format below, then delete `.boxline-web`.

## Format

```markdown
# web.md

> Site map and interaction guide for <url>, made with Boxline on <YYYY-MM-DD>

## Overview
- Site: <url>
- Pages mapped: <n>
- Interactive elements: <n>
- What it is: <e.g. marketing site with docs and a sign-up>

## Routes
| Route | Kind | What is there |
|---|---|---|

## Navigation
- Main menu: …
- Footer: …

## Pages
### <route>
**Actions:** "<exact label>" → <where it goes or what it does>
**Forms:** <field list, method, action>
**Sections:** …

## Flows
### Sign up
1. …

## Behind a sign-in
- <route>: <what the wall says>
```

## Rules

- Public pages only. Do not sign in, submit forms, solve CAPTCHAs or get around a wall: note it as behind a sign-in
  and move on.
- Only what was found: no guessed pages, buttons or flows. Quote labels exactly.
- Steps an agent can follow: addresses, labels and field names, not descriptions of the design.
- No emojis. Keep it scannable.
