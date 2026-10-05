---
name: design
description: Extract a website's design system into DESIGN.md - colors, fonts, type scale, spacing, radii, shadows, CSS design tokens and the look of its buttons, inputs and cards - measured from computed styles in a real browser (Boxline). Use when asked to copy, match, document or audit a site's look. Usage /design <url> [more pages].
---

# /design: a site's design system

Write `DESIGN.md` from what the site's pages really use, measured in a Boxline browser.

## Steps

1. **The address.** Take the URL the user gave (add `https://` when it has no scheme). One to three pages of the same
   site measure better than one: the home page plus, say, pricing and a docs page.
2. **Measure.** Run this skill's script from this skill's folder (Node 18+, `BOXLINE_API_KEY` set):

   ```bash
   npx -y -p @boxline/sdk node measure.mjs <url> [<url> …] > /tmp/design.json
   ```

   It opens each page at 1440×900 and prints, for each:
   - `page`: background, text color, base font;
   - `colors`: backgrounds weighted by area, text colors by amount of text, borders;
   - `fonts`: families for headings, body and code, sizes and weights by use;
   - `spacing`, `radii`, `shadows`: values by how often they occur;
   - `components`: distinct button styles, inputs and cards;
   - `tokens`: CSS custom properties on `:root`;
   - `darkMode`: whether the style sheets have dark-mode rules.

   With only the MCP server: `session_create`, `browser_navigate`, then `run_playwright` with the `MEASURE`
   expression from `measure.mjs` (`return await page.evaluate(MEASURE)`), then `session_stop`.
3. **Read it as a designer.**
   - Neutral: the page background and the most-used text color.
   - Accent: the background of the most prominent buttons, and colored links.
   - Type scale: the sizes in order.
   - Spacing scale: the values that recur, in order (ignore one-offs).
   - Radii and shadows: the ones that recur.
   - Buttons: primary is the filled one with the accent background; secondary the outlined or plain one.
4. **Write `DESIGN.md`** in the project root, in the format below.

## Format

```markdown
# DESIGN.md

> Design system of <url>, measured with Boxline on <YYYY-MM-DD> (pages: …)

## Colors
- Background: #…  · Text: #…  · Muted text: #…
- Accent: #… (primary buttons, links)
- Borders: #…

## Typography
- Headings: <family> · Body: <family> · Code: <family>
- Sizes: 14px, 16px, 20px, 32px, 48px
- Weights: 400, 500, 700

## Spacing
4px, 8px, 16px, 24px, 48px

## Radii
- Buttons and inputs: 6px · Cards: 12px · Pills: 9999px

## Shadows
- Cards: <value>

## Components
### Buttons
- Primary: background #…, text #…, radius 6px, padding 10px 16px, 600 weight
- Secondary: …
### Inputs
### Cards

## Design tokens
| Token | Value |
|---|---|

## Dark mode
The site has dark-mode styles (prefers-color-scheme).
```

## Rules

- Only measured values; leave out a section with no data. Never invent a value.
- Colors in hex, sizes in px. Say which page a value comes from when pages differ.
- Tokens: list the ones that look like design tokens (colors, fonts, sizes, radii), at most 40.
- No emojis.
