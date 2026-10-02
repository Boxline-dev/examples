"""Hero CTA review: does the landing page's main call to action work? A computer-use agent looks at the page the way a
visitor does and picks the hero's main button; then the button is measured in the page (contrast, size, position,
accessible name), its link is checked, and a short critique says what to change.

    python python/main.py            (BOXLINE_API_KEY; PAGE_URL; a model with a computer-use tool on the API)

The agent only looks (it is told not to click or type). Writes output/result.json, output/review.md, output/hero.png.
"""
import json
import os
import re
from pathlib import Path

from boxline import Boxline, BoxlineError

here = Path(__file__).resolve().parent
out = Path(os.environ.get("OUTPUT_DIR", "output"))
url = os.environ.get("PAGE_URL", "https://www.mozilla.org/en-US/firefox/")
measure = re.sub(r"^\s*//.*$", "", (here.parent / "measure-cta.js").read_text(), flags=re.M).strip()
bx = Boxline()

out.mkdir(parents=True, exist_ok=True)
with bx.sessions.create(viewport={"width": 1280, "height": 800}, timeout=600, idle_timeout=300, user_metadata={"example": "hero-cta-review"}) as session:
    print(f"Session: {session.id}", flush=True)
    session.goto(url, wait_until="load")
    (out / "hero.png").write_bytes(session.screenshot())
    # 1. What a visitor sees as the main call to action: the agent works from screenshots (computer mode).
    started = bx.agent.run(
        "Look at the page that is open (do not click, type or scroll away). In the hero section at the top, which is the main call-to-action button or link: "
        "the one the page most wants a visitor to press? Give its exact visible text, why it is the main one, and the texts of other buttons or links that compete with it in the hero.",
        session_id=session.id,
        mode="computer",
        max_steps=6,
        output={
            "type": "object",
            "properties": {
                "text": {"type": "string", "description": "the button's visible text exactly as written on it, and nothing else (no quotes, no sentence)"},
                "why": {"type": "string", "description": "one sentence"},
                "otherCandidates": {"type": "array", "items": {"type": "string"}, "description": "the visible texts of competing buttons or links"},
            },
            "required": ["text", "why", "otherCandidates"],
        },
    )
    print(f"Agent run {started['id']} ({started['model']}, computer use) is looking at the hero…", flush=True)
    run = bx.agent.wait(started["id"])
    if run["status"] != "completed" or not run["result"]:
        raise SystemExit(f"the agent run {run['status']}: {run.get('error') or 'no answer'}")
    seen = run["result"]
    print(f"Main CTA: \"{seen['text']}\" ({seen['why']})")
    # 2. The same element, measured exactly in the page.
    cta = session.evaluate(f"({measure})({json.dumps(seen['text'])})")
if not cta:
    raise SystemExit(f"no button or link with the text \"{seen['text']}\" was found in the page")

# 3. Where it leads (a sandboxed browser opens the link).
link = None
if cta["href"] and re.match(r"^https?:", cta["href"]):
    try:
        p = bx.fetch(cta["href"], format="text")
        link = {"status": p["status"], "title": p["title"], "finalUrl": p["finalUrl"]}
    except BoxlineError as e:
        link = {"status": None, "title": "", "finalUrl": None, "error": str(e)}
problems = [
    p
    for p in [
        cta["contrast"] < cta["needs"] and f"text contrast {cta['contrast']}:1 ({cta['color']} on {cta['background']}) is below WCAG AA's {cta['needs']}:1",
        (cta["width"] < 44 or cta["height"] < 44) and f"{cta['width']} × {cta['height']} px is small to tap (44 × 44 is comfortable)",
        not cta["aboveTheFold"] and "it is not fully visible without scrolling",
        not cta["accessibleName"] and "it has no accessible name",
        link and (link["status"] is None or link["status"] >= 400) and f"its link answers {link['status'] or 'nothing'}",
    ]
    if p
]

# 4. A short critique from the measurements.
r = bx.extract(
    url=url,
    prompt=(
        f"The landing page's main call to action is \"{cta['text']}\". Measured: {json.dumps({**cta, 'link': link, 'problems': problems})}. Competing calls to action the visitor sees: "
        f"{'; '.join(seen['otherCandidates']) or 'none'}. verdict: two sentences on how well it works. suggestions: up to 4 concrete changes (wording, colour, size, placement), each grounded in the measurements or the page."
    ),
    schema={"type": "object", "properties": {"verdict": {"type": "string"}, "suggestions": {"type": "array", "items": {"type": "string"}}}, "required": ["verdict", "suggestions"]},
)
critique = r["data"]
print(f"Measured: {cta['width']}×{cta['height']} px at ({cta['centre']['x']}, {cta['centre']['y']}), {cta['color']} on {cta['background']} = {cta['contrast']}:1, {'above the fold' if cta['aboveTheFold'] else 'below the fold'}")
print(f"Link: {cta['href']} → " + (f"{link['status']} \"{link['title']}\"" if link else "none"))
for p in problems:
    print(f"  ! {p}")
print(f"\n{critique['verdict']}\n" + "\n".join(f"  - {s}" for s in critique["suggestions"]))
md = [f"# Hero CTA review: {url}", "", f"**\"{cta['text']}\"**: {seen['why']}", "", critique["verdict"], "", "## Measured", ""]
md += [f"- {cta['width']} × {cta['height']} px, {'above the fold' if cta['aboveTheFold'] else 'below the fold'}", f"- {cta['color']} on {cta['background']}: {cta['contrast']}:1 (needs {cta['needs']}:1)", f"- Leads to {cta['href'] or 'nothing'}" + (f" ({link['status']})" if link else "")]
md += [f"- Problem: {p}" for p in problems] + ["", "## Suggestions", ""] + [f"- {s}" for s in critique["suggestions"]] + ["", "![The hero](hero.png)", ""]
(out / "review.md").write_text("\n".join(md))
result = {"url": url, "seen": seen, "cta": cta, "link": link, "problems": problems, "verdict": critique["verdict"], "suggestions": critique["suggestions"], "agentRuns": [{"id": run["id"]}], "usage": {"modelUsd": r["usage"]["costUsd"]}}
(out / "result.json").write_text(json.dumps(result, indent=2, ensure_ascii=False))
