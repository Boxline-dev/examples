"""Dark pattern review, in two parts:
1. An agent goes through a sign-up or checkout flow, stops before anything is bought or sent, and points out confusing
   or deceptive steps. The default is saucedemo.com, a demo shop made for testing.
2. A page scan: each page the agent went through (or PAGES) is measured in the browser (boxes ticked in advance,
   countdowns that start again on reload, fees no earlier page showed, small print, pop-up wording), and a model sorts what it finds
   into categories. Every pattern quotes the page; a quote that is not on the page is set aside, not reported.

    python python/main.py            (BOXLINE_API_KEY; TASK to review your own flow; PAGES, comma-separated, to scan)

Writes output/review.md, output/patterns.md and output/result.json.
"""
import json
import os
import re
import time
from pathlib import Path
from urllib.parse import urlparse

from boxline import Boxline

here = Path(__file__).resolve().parent
out = Path(os.environ.get("OUTPUT_DIR", "output"))
task = os.environ.get(
    "TASK",
    "Open https://www.saucedemo.com, a demo shop made for testing, and sign in with the demo username and password shown on "
    "its page. Add one product to the cart and go through the checkout up to the last step before the order is placed, "
    "using the name Test User and the postcode 10115. Don't place the order. For each step, tell me if anything is "
    "confusing or deceptive: hidden costs, pre-ticked options, fake urgency, or a hard way back.",
)
pages_to_scan = [s.strip() for s in os.environ.get("PAGES", "").split(",") if s.strip()]
scan_js = (here.parent / "scan.js").read_text()
bx = Boxline()

CATEGORIES = ["urgency", "scarcity", "sneaking", "hidden_costs", "confirmshaming", "forced_continuity", "obstruction", "misdirection", "forced_action"]
PATTERNS = {
    "type": "object",
    "properties": {
        "patterns": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "category": {
                        "type": "string",
                        "enum": CATEGORIES,
                        "description": "urgency: time pressure (countdowns, 'ends tonight'); scarcity: low-stock or high-demand claims; sneaking: something added or ticked for the visitor in advance; hidden_costs: fees shown late or only in the total; confirmshaming: a 'no' worded to shame; forced_continuity: a trial or plan that renews and charges unless cancelled; obstruction: hard to cancel, leave or say no; misdirection: misleading buttons or design that hides the real choice; forced_action: a sign-up, share or other unrelated step required to go on",
                    },
                    "name": {"type": "string", "description": "a few words, e.g. 'countdown that restarts'"},
                    "quote": {"type": "string", "description": "the exact words on the page that show it, copied as written"},
                    "why": {"type": "string", "description": "one sentence: why it misleads or pressures"},
                },
                "required": ["category", "name", "quote", "why"],
            },
        }
    },
    "required": ["patterns"],
}


def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9$€£.%]+", " ", s.lower()).strip()


def amounts(s: str) -> list:
    return [a.replace(",", "") for a in re.findall(r"\d[\d,]*\.\d{2}", s)]


def seconds(clock: str) -> int:
    total = 0
    for n in clock.split(":"):
        total = total * 60 + int(n)
    return total


with bx.sessions.create(timeout=1200, user_metadata={"example": "dark-pattern-review"}) as session:
    print(f"Session: {session.id}", flush=True)
    # 1. The agent's walk through the flow, in this session (so the scan sees the same signed-in pages).
    run = bx.agent.run(task, session_id=session.id, max_steps=40)
    print(f"Agent run {run['id']} ({run['provider']}/{run['model']})", flush=True)
    for e in bx.agent.stream(run["id"]):
        if e["type"] == "tool":
            print(f"→ {e['name']} {json.dumps(e.get('input') or {})[:90]}", flush=True)
        elif e["type"] == "done":
            print(f"\n{e['status']}:\n{e.get('result') or e.get('error')}")
    done = bx.agent.get(run["id"])
    model_usd = done["usage"]["costUsd"] or 0
    # Every page the agent was on, from its tool calls and what they reported back.
    steps = json.dumps([[s.get("input"), s.get("output")] for s in done["steps"]])
    pages = list(dict.fromkeys(u.rstrip(".,") for u in re.findall(r"https?://[^\s\"'\\)]+", steps)))

    # 2. The page scan: the pages given, else the agent's pages (never the one after an order is placed).
    host = urlparse(pages[0]).netloc if pages else ""
    targets = pages_to_scan or [u for u in pages if urlparse(u).netloc == host and not re.search(r"complete|confirm|thank", u, re.I)][-4:]
    scans = []
    seen_amounts: set = set()  # every amount on the pages scanned before this one
    for url in targets:
        session.goto(url)
        t0 = time.monotonic()
        first = session.evaluate(scan_js)
        if first["timers"]:
            # A real countdown keeps going while we wait; a fake one starts again when the page is loaded again.
            time.sleep(3)
            session.goto(url)
            elapsed = time.monotonic() - t0
            again = session.evaluate(scan_js)
            for t, later in zip(first["timers"], again["timers"]):
                if re.search(r"\d:\d\d", t["text"]) and re.search(r"\d:\d\d", later["text"]):
                    t["restartsOnReload"] = seconds(t["text"]) - seconds(later["text"]) < elapsed - 2
        # A fee whose amount no earlier page showed was added late (drip pricing).
        if scans:
            first["lateCharges"] = [c for c in first["charges"] if any(a not in seen_amounts for a in amounts(c))]
        seen_amounts.update(amounts(first["text"]))
        facts = {k: v for k, v in first.items() if k != "text"}
        r = session.extract(
            "Find the dark patterns on this page: design that pushes or tricks a visitor (false urgency or scarcity, options ticked in advance, "
            "costs shown late, guilt-tripping wording on a 'no', renewals in small print, a hard way out, misleading buttons, forced sign-ups). "
            "Report only what the page clearly shows, each with the exact words from the page. These measurements were taken in the browser (lateCharges: fees that no earlier page of the flow showed): "
            + json.dumps(facts)[:4000],
            schema=PATTERNS,
        )
        model_usd += r["usage"]["costUsd"] or 0
        page = norm(first["text"])
        verified = [p for p in r["data"]["patterns"] if p.get("quote") and norm(p["quote"]) in page]
        unverified = [p for p in r["data"]["patterns"] if p not in verified]
        scans.append({"url": url, "measured": facts, "patterns": verified, "unverified": unverified})
        aside = f" ({len(unverified)} set aside: quote not on the page)" if unverified else ""
        print(f"\n{url}: {len(verified)} patterns{aside}")
        for p in verified:
            print(f"  {p['category']}: {p['name']}. \"{p['quote']}\"")

md = []
for s in scans:
    md += [f"## {s['url']}", ""] + ([f"- **{p['category']}**: {p['name']}. \"{p['quote']}\". {p['why']}" for p in s["patterns"]] or ["Nothing found."]) + [""]
out.mkdir(parents=True, exist_ok=True)
(out / "review.md").write_text(f"{done['result'] or ''}\n")
(out / "patterns.md").write_text("\n".join(md) + "\n")
result = {"task": task, "status": done["status"], "review": done["result"], "pages": pages, "steps": len(done["steps"]), "scans": scans,
          "agentRuns": [{"id": run["id"]}], "model": done["model"], "usage": {"modelUsd": model_usd}}
(out / "result.json").write_text(json.dumps(result, indent=2, ensure_ascii=False))
