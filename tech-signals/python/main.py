"""Tech signals: find the themes many Hacker News stories of the last days share, read each theme's stories, and make
one grounded prediction per theme, with the facts from the pages it rests on.

    python python/main.py            (BOXLINE_API_KEY; a plan with shell sessions; WINDOW_HOURS, MIN_POINTS, TOP)

signals.py does the collecting and clustering in the session's shell (HN's official search API); then one extract
call per theme reads up to 3 of its stories' pages. Writes output/result.json and output/predictions.md.
"""
import json
import os
from pathlib import Path

from boxline import Boxline

here = Path(__file__).resolve().parent
out = Path(os.environ.get("OUTPUT_DIR", "output"))
env = {
    "HN_SEARCH_URL": os.environ.get("HN_SEARCH_URL", "https://hn.algolia.com/api/v1/search_by_date"),
    "WINDOW_HOURS": os.environ.get("WINDOW_HOURS", "48"),
    "MIN_POINTS": os.environ.get("MIN_POINTS", "50"),
    "TOP": os.environ.get("TOP", "3"),
    "SPECIFICITY": os.environ.get("SPECIFICITY", "4.5"),
}
bx = Boxline()

with bx.sessions.create(browser=False, shell=True, setup=["pip install -q wordfreq"], timeout=600, idle_timeout=300, user_metadata={"example": "tech-signals"}) as session:
    print(f"Session: {session.id}", flush=True)
    session.files.write("signals.py", (here.parent / "signals.py").read_bytes())
    r = session.exec("python signals.py", env=env, timeout_ms=180_000)
    if r["exitCode"] != 0:
        raise SystemExit(f"signals.py failed: {r['stderr'].strip()}")
    print(r["stdout"].strip())
    signals = json.loads(session.files.read_text("signals.json"))
# the session is released here: the predictions below need no machine of ours

if not signals["themes"]:
    raise SystemExit("no theme is shared by two stories in this window; widen WINDOW_HOURS or lower MIN_POINTS")

# One prediction per theme, from what its stories' pages say (not just their titles).
predictions, model_usd = [], 0.0
for theme in signals["themes"]:
    stories = theme["stories"][:3]
    r = bx.extract(
        urls=[s["url"] for s in stories],
        prompt=(
            f'These pages are recent stories that share one theme: "{theme["label"]}". Make one prediction about where this is going in '
            "the next 6 to 12 months. claim: at most 30 words. rationale: why, from what the pages say. confidence: low, medium or high. "
            "evidence: 2 to 4 facts as the pages state them, each with the URL of its page (one of the pages given)."
        ),
        schema={
            "type": "object",
            "properties": {
                "claim": {"type": "string"},
                "rationale": {"type": "string"},
                "confidence": {"type": "string", "enum": ["low", "medium", "high"]},
                "evidence": {"type": "array", "items": {"type": "object", "properties": {"url": {"type": "string"}, "fact": {"type": "string"}}, "required": ["url", "fact"]}},
            },
            "required": ["claim", "rationale", "confidence", "evidence"],
        },
    )
    model_usd += r["usage"]["costUsd"]
    p = r["data"]
    predictions.append({"theme": theme["label"], "stories": stories, "pages": r["pages"], **p})
    print(f"\n{theme['label']} ({len(theme['stories'])} stories, score {theme['score']})\n  → {p['claim']} [{p['confidence']}]\n  {p['rationale']}")
    for e in p["evidence"]:
        print(f"    · {e['fact']} ({e['url']})")

md = [f"# Tech signals: the last {signals['windowHours']:g} hours", "", f"{signals['collected']} Hacker News stories; the themes several of them share, and where each may be going.", ""]
for p in predictions:
    md += [f"## {p['theme']}", "", f"**{p['claim']}** (confidence: {p['confidence']})", "", p["rationale"], ""]
    md += [f"- {e['fact']} ([source]({e['url']}))" for e in p["evidence"]] + [""]
    md += ["Stories: " + " · ".join(f"[{s['title']}]({s['url']}) ({s['points']} points)" for s in p["stories"]), ""]
out.mkdir(parents=True, exist_ok=True)
(out / "predictions.md").write_text("\n".join(md))
result = {"collected": signals["collected"], "windowHours": signals["windowHours"], "themes": signals["themes"], "predictions": predictions, "usage": {"modelUsd": model_usd}}
(out / "result.json").write_text(json.dumps(result, indent=2, ensure_ascii=False))
print(f"\nWrote {out / 'predictions.md'} (${model_usd:.4f} of model use)")
