// A function of the call-to-action's visible text. Runs in the page (session.evaluate): finds that button or link and
// measures it: its colours and WCAG contrast, size, position, accessible name and target. Returns plain JSON, or null.
(text) => {
  const norm = (s) => (s || "").replace(/\s+/g, " ").trim().toLowerCase();
  const want = norm(text);
  const candidates = [...document.querySelectorAll("a, button, [role=button], input[type=submit], input[type=button]")].filter((e) => e.getClientRects().length);
  const label = (e) => norm(e.innerText || e.value || e.getAttribute("aria-label"));
  const el = candidates.find((e) => label(e) === want) || candidates.find((e) => label(e).includes(want) || (want.includes(label(e)) && label(e).length > 2));
  if (!el) return null;
  const parse = (c) => {
    const m = /rgba?\(([^)]+)\)/.exec(c);
    if (!m) return null;
    const [r, g, b, a = 1] = m[1].split(",").map(Number);
    return { r, g, b, a };
  };
  const channel = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const lum = ({ r, g, b }) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  const hex = ({ r, g, b }) => "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
  let bg = null;
  for (let e = el; e && !bg; e = e.parentElement) {
    const c = parse(getComputedStyle(e).backgroundColor);
    if (c && c.a > 0.5) bg = c;
  }
  bg = bg || { r: 255, g: 255, b: 255 };
  const s = getComputedStyle(el);
  const fg = parse(s.color);
  const [hi, lo] = [lum(fg), lum(bg)].sort((x, y) => y - x);
  const px = parseFloat(s.fontSize);
  const large = px >= 24 || (parseInt(s.fontWeight, 10) >= 700 && px >= 18.66);
  const r = el.getBoundingClientRect();
  return {
    tag: el.tagName.toLowerCase(),
    text: (el.innerText || el.value || "").trim(),
    accessibleName: (el.getAttribute("aria-label") || el.innerText || el.value || "").trim(),
    href: el.href || (el.form ? el.form.action : null),
    color: hex(fg),
    background: hex(bg),
    contrast: Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100,
    needs: large ? 3 : 4.5,
    fontSizePx: px,
    width: Math.round(r.width),
    height: Math.round(r.height),
    centre: { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) },
    aboveTheFold: r.bottom <= innerHeight && r.top >= 0,
    otherButtons: candidates.filter((e) => e !== el && e.getBoundingClientRect().bottom <= innerHeight).map((e) => (e.innerText || e.value || "").trim()).filter(Boolean).slice(0, 8),
  };
}
