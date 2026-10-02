// Runs in the page (session.evaluate): measures what a design review looks at, from the browser's computed styles.
// One expression; returns plain JSON.
(() => {
  const parse = (c) => {
    const m = /rgba?\(([^)]+)\)/.exec(c);
    if (!m) return null;
    const [r, g, b, a = 1] = m[1].split(",").map(Number);
    return { r, g, b, a };
  };
  const channel = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const lum = ({ r, g, b }) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  const contrast = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  const backgroundOf = (el) => {
    for (let e = el; e; e = e.parentElement) {
      const c = parse(getComputedStyle(e).backgroundColor);
      if (c && c.a > 0.5) return c;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  };
  const hex = ({ r, g, b }) => "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
  const bump = (m, k) => m.set(k, (m.get(k) || 0) + 1);
  const colors = new Map();
  const fonts = new Map();
  const sizes = new Map();
  const failures = [];
  // Elements that hold text of their own (not only through children).
  const withText = [...document.querySelectorAll("body *")].filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1));
  for (const e of withText.slice(0, 2000)) {
    const s = getComputedStyle(e);
    if (s.visibility === "hidden" || s.display === "none" || !e.getClientRects().length) continue;
    const fg = parse(s.color);
    if (!fg) continue;
    const bg = backgroundOf(e);
    bump(colors, hex(fg));
    bump(colors, hex(bg));
    bump(fonts, s.fontFamily.split(",")[0].replace(/["']/g, "").trim());
    const px = parseFloat(s.fontSize);
    bump(sizes, `${Math.round(px)}px`);
    // WCAG 2.2 AA: 4.5:1 for text, 3:1 for large text (24px, or 18.66px bold).
    const large = px >= 24 || (parseInt(s.fontWeight, 10) >= 700 && px >= 18.66);
    const ratio = contrast(fg, bg);
    if (ratio < (large ? 3 : 4.5)) failures.push({ text: e.textContent.trim().replace(/\s+/g, " ").slice(0, 60), color: hex(fg), background: hex(bg), ratio: Math.round(ratio * 100) / 100, needs: large ? 3 : 4.5, sizePx: px });
  }
  const levels = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((h) => Number(h.tagName[1]));
  const headingSkips = [];
  for (let i = 1; i < levels.length; i++) if (levels[i] > levels[i - 1] + 1) headingSkips.push(`h${levels[i - 1]} → h${levels[i]}`);
  const vw = document.documentElement.clientWidth;
  const overflow = document.documentElement.scrollWidth > vw + 1;
  const name = (e) => e.tagName.toLowerCase() + (e.id ? `#${e.id}` : typeof e.className === "string" && e.className.trim() ? `.${e.className.trim().split(/\s+/)[0]}` : "");
  // WCAG 2.5.8 (AA): targets at least 24 × 24 CSS pixels.
  const small = [...document.querySelectorAll("a, button, input:not([type=hidden]), select, textarea, [role=button]")]
    .map((e) => ({ e, r: e.getBoundingClientRect() }))
    .filter(({ r }) => r.width > 0 && r.height > 0 && (r.width < 24 || r.height < 24))
    .slice(0, 20)
    .map(({ e, r }) => ({ target: (e.innerText || e.value || e.getAttribute("aria-label") || name(e)).trim().slice(0, 40), width: Math.round(r.width), height: Math.round(r.height) }));
  const top = (m, n) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([value, count]) => ({ value, count }));
  return {
    viewport: vw,
    palette: top(colors, 8),
    fonts: top(fonts, 5),
    sizes: top(sizes, 8),
    contrastFailures: failures.slice(0, 30),
    imagesWithoutAlt: [...document.images].filter((i) => !i.hasAttribute("alt")).map((i) => i.currentSrc || i.src).slice(0, 20),
    headingSkips,
    horizontalOverflow: overflow,
    overflowing: overflow ? [...document.querySelectorAll("body *")].filter((e) => e.getBoundingClientRect().right > vw + 1).slice(0, 5).map(name) : [],
    smallTargets: small,
  };
})()
