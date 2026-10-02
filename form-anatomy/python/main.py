"""Form anatomy: take a web form apart without submitting it. Every field with its label, type and rules (required,
length, range, pattern, autocomplete), the messages the browser itself shows for an empty and for a wrong value,
the hidden fields (and whether one is a CSRF token), where and how it posts, and warnings (passwords without HTTPS,
posting to another site, fields without labels). For testing and documenting your own forms.

    python python/main.py            (BOXLINE_API_KEY; FORM_URL, FORM_SELECTOR)

anatomy.js runs in the page; no model is used and nothing is submitted. Writes output/result.json and output/form.md.
"""
import json
import os
import re
from pathlib import Path

from boxline import Boxline

here = Path(__file__).resolve().parent
out = Path(os.environ.get("OUTPUT_DIR", "output"))
url = os.environ.get("FORM_URL", "https://httpbin.org/forms/post")
selector = os.environ.get("FORM_SELECTOR", "")
anatomy = re.sub(r"^\s*//.*$", "", (here.parent / "anatomy.js").read_text(), flags=re.M).strip()
bx = Boxline()

with bx.sessions.create(timeout=180, user_metadata={"example": "form-anatomy"}) as session:
    print(f"Session: {session.id}", flush=True)
    session.goto(url, wait_until="load")
    form = session.evaluate(f"({anatomy})({json.dumps(selector)})")
    out.mkdir(parents=True, exist_ok=True)
    (out / "form.png").write_bytes(session.screenshot(full_page=True))
if not form:
    raise SystemExit(f"no form{' matches ' + selector if selector else ''} on {url}")


def rules(f):
    parts = ["required" if f["required"] else None, f["minlength"] and f"at least {f['minlength']} characters", f["maxlength"] and f"at most {f['maxlength']}", f["min"] and f"≥ {f['min']}", f["max"] and f"≤ {f['max']}", f["pattern"] and f"pattern {f['pattern']}", f["autocomplete"] and f"autocomplete={f['autocomplete']}"]
    return ", ".join(p for p in parts if p)


flags = (", submitted by a script" if form["scriptedSubmit"] else "") + (", browser checks off" if form["novalidate"] else "")
print(f"{form['method'].upper()} {form['action']} ({form['enctype']}){flags}")
for f in form["fields"]:
    line = f"  {f['label'] or f['name']} [{f['type']}] {rules(f)}"
    if f["emptyMessage"]:
        line += f"\n      empty: \"{f['emptyMessage']}\""
    if f["invalidMessage"]:
        line += f"\n      \"{f['invalidExample']}\": \"{f['invalidMessage']}\""
    print(line)
print("Hidden: " + (", ".join(f"{h['name']}{' (token)' if h['looksLikeToken'] else ''}" for h in form["hidden"]) or "none"))
for w in form["warnings"]:
    print(f"  ! {w}")

md = [f"# Form at {form['page']}", "", f"`{form['method'].upper()} {form['action']}` ({form['enctype']}){flags}.", "", "| Field | Type | Rules | Empty | A wrong value |", "|---|---|---|---|---|"]
for f in form["fields"]:
    wrong = f"`{f['invalidExample']}`: {f['invalidMessage'] or 'accepted'}" if f["invalidExample"] else ""
    md.append(f"| {f['label'] or f['name']} (`{f['name']}`) | {f['type']} | {rules(f) or 'none'} | {f['emptyMessage'] or 'accepted'} | {wrong} |")
md += ["", "Hidden fields: " + (", ".join(f"`{h['name']}`" + (" (a token)" if h["looksLikeToken"] else "") for h in form["hidden"]) or "none") + ".", ""]
if form["warnings"]:
    md += ["## Warnings", ""] + [f"- {w}" for w in form["warnings"]] + [""]
md += ["![The form](form.png)", ""]
(out / "form.md").write_text("\n".join(md))
(out / "result.json").write_text(json.dumps({"url": url, "selector": selector or None, **form}, indent=2, ensure_ascii=False))
