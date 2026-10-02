"""UI review: a design check of a page from what the browser actually renders, at desktop and phone width: its colour
palette, fonts and sizes, text that fails WCAG contrast (computed), images without alt text, skipped heading
levels, sideways scrolling and too-small tap targets on a phone, with screenshots and the top fixes in plain words.

    python python/main.py            (BOXLINE_API_KEY; PAGE_URL)

measure.js runs in the page; the fixes are written by a model from those measurements. Writes output/result.json,
output/review.md, output/desktop.png and output/phone.png.
"""
import json
import os
from pathlib import Path

from boxline import Boxline

here = Path(__file__).resolve().parent
out = Path(os.environ.get("OUTPUT_DIR", "output"))
url = os.environ.get("PAGE_URL", "https://books.toscrape.com/")
measure = (here.parent / "measure.js").read_text()
bx = Boxline()


def look(name: str, viewport: dict) -> dict:
    """Opens the page at one viewport, measures it and keeps a screenshot."""
    with bx.sessions.create(viewport=viewport, timeout=180, user_metadata={"example": "ui-review"}) as session:
        print(f"Session: {session.id} ({name}, {viewport['width']}×{viewport['height']})", flush=True)
        session.goto(url, wait_until="load")
        (out / f"{name}.png").write_bytes(session.screenshot(full_page=True))
        return session.evaluate(measure)


out.mkdir(parents=True, exist_ok=True)
desktop = look("desktop", {"width": 1280, "height": 800})
phone = look("phone", {"width": 375, "height": 812})

# The fixes, from the measurements (the model sees the numbers and the page text, not a guess at the pixels).
findings = {
    "contrast": desktop["contrastFailures"][:10],
    "imagesWithoutAlt": len(desktop["imagesWithoutAlt"]),
    "headingSkips": desktop["headingSkips"],
    "phone": {"horizontalOverflow": phone["horizontalOverflow"], "overflowing": phone["overflowing"], "smallTargets": phone["smallTargets"][:10]},
    "palette": [p["value"] for p in desktop["palette"]],
    "fonts": [f["value"] for f in desktop["fonts"]],
}
r = bx.extract(
    url=url,
    prompt=f"A design review of this page. Measurements from the browser: {json.dumps(findings)[:3500]}. summary: two sentences on the page's look and its main problems. fixes: up to 6, most important first, each concrete (which element, what to change), why it matters, and a priority. Base them on the measurements.",
    schema={"type": "object", "properties": {"summary": {"type": "string"}, "fixes": {"type": "array", "items": {"type": "object", "properties": {"fix": {"type": "string"}, "why": {"type": "string"}, "priority": {"type": "string", "enum": ["high", "medium", "low"]}}, "required": ["fix", "why", "priority"]}}}, "required": ["summary", "fixes"]},
)
review = r["data"]

print(f"\nPalette: {' '.join(p['value'] for p in desktop['palette'])}\nFonts: {', '.join(f['value'] for f in desktop['fonts'])}; sizes {', '.join(s['value'] for s in desktop['sizes'])}")
print(f"Contrast failures: {len(desktop['contrastFailures'])}" + "".join(f"\n  \"{c['text']}\" {c['color']} on {c['background']}: {c['ratio']}:1 (needs {c['needs']}:1)" for c in desktop["contrastFailures"][:3]))
print(f"Images without alt: {len(desktop['imagesWithoutAlt'])}; heading skips: {', '.join(desktop['headingSkips']) or 'none'}")
print(f"Phone: {'scrolls sideways (' + ', '.join(phone['overflowing']) + ')' if phone['horizontalOverflow'] else 'fits'}; small tap targets: {len(phone['smallTargets'])}")
print(f"\n{review['summary']}\n" + "\n".join(f"  [{f['priority']}] {f['fix']}" for f in review["fixes"]))

contrast = "".join(f"\n  - \"{c['text']}\": {c['color']} on {c['background']}, {c['ratio']}:1 (needs {c['needs']}:1)" for c in desktop["contrastFailures"])
targets = ", ".join(f"{t['target']} ({t['width']}×{t['height']})" for t in phone["smallTargets"]) or "none"
md = [f"# UI review: {url}", "", review["summary"], "", "## Fixes", ""] + [f"- **{f['priority']}**: {f['fix']} ({f['why']})" for f in review["fixes"]]
md += ["", "## Measured", "", "- Palette: " + " ".join(f"`{p['value']}`" for p in desktop["palette"]), f"- Fonts: {', '.join(f['value'] for f in desktop['fonts'])}; sizes: {', '.join(s['value'] for s in desktop['sizes'])}"]
md += [f"- Contrast failures (WCAG AA): {len(desktop['contrastFailures'])}{contrast}", f"- Images without alt text: {len(desktop['imagesWithoutAlt'])}", f"- Heading levels skipped: {', '.join(desktop['headingSkips']) or 'none'}"]
md += [f"- Phone (375 px): {'scrolls sideways because of ' + ', '.join(phone['overflowing']) if phone['horizontalOverflow'] else 'fits the width'}; tap targets under 24 px: {targets}", "", "| Desktop | Phone |", "|---|---|", "| ![](desktop.png) | ![](phone.png) |", ""]
(out / "review.md").write_text("\n".join(md))
(out / "result.json").write_text(json.dumps({"url": url, "desktop": desktop, "phone": phone, "summary": review["summary"], "fixes": review["fixes"], "usage": {"modelUsd": r["usage"]["costUsd"]}}, indent=2, ensure_ascii=False))
