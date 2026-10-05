#!/usr/bin/env node
/**
 * Measures a site's design in a Boxline browser: the colors, fonts, sizes, spacing, radii and shadows the page really
 * uses (computed styles, weighted by how much of the page they cover), its CSS custom properties (design tokens), and
 * the look of its buttons, inputs and cards. Prints JSON; the design skill writes DESIGN.md from it.
 *
 *   BOXLINE_API_KEY=bxl_… node measure.mjs https://example.com [more pages of the same site…]
 *
 * Needs Node 18+ and @boxline/sdk (npm install @boxline/sdk, or run it with: npx -y -p @boxline/sdk node measure.mjs …).
 */
import { Boxline } from "@boxline/sdk";

const urls = process.argv.slice(2).map((u) => (/^https?:\/\//.test(u) ? u : `https://${u}`));
if (!urls.length) {
  console.error("Usage: node measure.mjs <url> [url…]");
  process.exit(2);
}

// Runs in the page. One expression; returns plain JSON.
const MEASURE = `(() => {
  const hex = (c) => {
    const m = /rgba?\\(([^)]+)\\)/.exec(c || "");
    if (!m) return null;
    const [r, g, b, a = 1] = m[1].split(/[ ,\\/]+/).filter(Boolean).map(Number);
    if (a < 0.5) return null;
    return "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
  };
  const tally = () => new Map();
  const add = (m, k, w = 1) => k && m.set(k, (m.get(k) || 0) + w);
  const top = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([value, weight]) => ({ value, weight: Math.round(weight) }));
  // On the page and big enough to see: not off-screen until focused ("skip to content") or screen-reader-only text.
  const visible = (el, r) => r.width > 2 && r.height > 2 && r.bottom + scrollY > 0 && r.right > 0 && getComputedStyle(el).visibility !== "hidden" && getComputedStyle(el).opacity !== "0";
  const ownText = (el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(" ").trim();
  const bg = tally(), fg = tally(), border = tally(), families = tally(), sizes = tally(), weights = tally(), spacing = tally(), radii = tally(), shadows = tally();
  const role = { headings: tally(), body: tally(), mono: tally() };
  const els = [...document.querySelectorAll("body *")].slice(0, 4000);
  for (const el of els) {
    const r = el.getBoundingClientRect();
    if (!visible(el, r)) continue;
    const st = getComputedStyle(el);
    const area = Math.min(r.width * r.height, innerWidth * innerHeight);
    add(bg, hex(st.backgroundColor), area / 1000);
    if (st.borderStyle !== "none" && parseFloat(st.borderWidth) > 0) add(border, hex(st.borderColor));
    const text = ownText(el);
    if (text) {
      add(fg, hex(st.color), text.length);
      const fam = st.fontFamily.split(",")[0].replace(/["']/g, "").trim();
      add(families, fam, text.length);
      add(/^H[1-3]$/.test(el.tagName) ? role.headings : /^(CODE|PRE|KBD|SAMP)$/.test(el.tagName) ? role.mono : role.body, fam, text.length);
      add(sizes, st.fontSize, text.length);
      add(weights, st.fontWeight, text.length);
    }
    for (const p of ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "marginTop", "marginBottom", "rowGap", "columnGap"]) {
      const v = parseFloat(st[p]);
      if (v > 0 && v <= 160) add(spacing, Math.round(v) + "px");
    }
    if (st.borderTopLeftRadius !== "0px") add(radii, st.borderTopLeftRadius);
    if (st.boxShadow !== "none") add(shadows, st.boxShadow);
  }
  const look = (el) => {
    const st = getComputedStyle(el);
    return { text: (el.innerText || el.value || el.placeholder || "").trim().slice(0, 40), background: hex(st.backgroundColor), color: hex(st.color),
      border: st.borderStyle !== "none" && parseFloat(st.borderWidth) > 0 ? st.borderWidth + " " + st.borderStyle + " " + hex(st.borderColor) : null,
      radius: st.borderTopLeftRadius, padding: st.padding, fontSize: st.fontSize, fontWeight: st.fontWeight, height: Math.round(el.getBoundingClientRect().height) + "px", shadow: st.boxShadow === "none" ? null : st.boxShadow };
  };
  const shown = (sel, n) => [...document.querySelectorAll(sel)].filter((el) => visible(el, el.getBoundingClientRect())).slice(0, n);
  // Buttons: real buttons and links styled as buttons (their own background or border).
  const buttons = shown("button, [role=button], a, input[type=submit]", 400)
    .filter((el) => { const st = getComputedStyle(el); return (el.tagName !== "A" || hex(st.backgroundColor) || parseFloat(st.borderWidth) > 0) && (el.innerText || el.value || "").trim(); })
    .map(look);
  const seen = new Set();
  const distinctButtons = buttons.filter((b) => { const k = [b.background, b.color, b.border, b.radius].join(); return !seen.has(k) && seen.add(k); }).slice(0, 6);
  const inputs = shown("input:not([type=hidden]):not([type=submit]):not([type=checkbox]):not([type=radio]), textarea, select", 4).map(look);
  // Cards: boxes with a radius and a shadow or border that hold a heading or several lines of text.
  const cards = shown("div, article, section, li", 3000)
    .filter((el) => { const st = getComputedStyle(el); const r = el.getBoundingClientRect(); return st.borderTopLeftRadius !== "0px" && (st.boxShadow !== "none" || parseFloat(st.borderWidth) > 0) && r.width > 120 && r.width < innerWidth * 0.9 && r.height > 80; })
    .slice(0, 3).map((el) => ({ ...look(el), text: undefined }));
  // CSS custom properties on :root and html (design tokens), from the style sheets this page may read.
  const tokens = {};
  let darkMode = false, unreadableSheets = 0;
  const walk = (rules) => { for (const rule of rules) {
    if (rule.media && /prefers-color-scheme:\\s*dark/.test(rule.media.mediaText)) darkMode = true;
    if (rule.cssRules) walk(rule.cssRules);
    if (rule.selectorText && /(^|,)\\s*(:root|html)\\b/.test(rule.selectorText)) for (const p of rule.style) if (p.startsWith("--") && Object.keys(tokens).length < 150) tokens[p] = rule.style.getPropertyValue(p).trim();
  } };
  for (const sheet of document.styleSheets) { try { walk(sheet.cssRules); } catch { unreadableSheets++; } }
  const page = getComputedStyle(document.body);
  return {
    url: location.href, title: document.title, viewport: innerWidth + "x" + innerHeight,
    page: { background: hex(page.backgroundColor) || hex(getComputedStyle(document.documentElement).backgroundColor) || "#ffffff", color: hex(page.color), fontFamily: page.fontFamily, fontSize: page.fontSize, lineHeight: page.lineHeight },
    colors: { backgrounds: top(bg, 10), text: top(fg, 10), borders: top(border, 6) },
    fonts: { families: top(families, 6), headings: top(role.headings, 2), body: top(role.body, 2), mono: top(role.mono, 2), sizes: top(sizes, 12), weights: top(weights, 6) },
    spacing: top(spacing, 12), radii: top(radii, 8), shadows: top(shadows, 5),
    components: { buttons: distinctButtons, inputs, cards },
    tokens, darkMode, unreadableSheets,
  };
})()`;

const bx = new Boxline();
const session = await bx.sessions.create({ timeout: 300, viewport: { width: 1440, height: 900 }, userMetadata: { skill: "design" } });
const pages = [];
try {
  for (const url of urls) {
    await session.goto(url);
    await new Promise((r) => setTimeout(r, 1500)); // web fonts and late styles
    pages.push(await session.evaluate(MEASURE));
  }
} finally {
  await session.stop();
}
console.log(JSON.stringify(pages.length === 1 ? pages[0] : pages, null, 2));
