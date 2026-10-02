"""Accessibility check: run the axe-core scan on a page in the session's browser and list the issues, worst first.
The shell fetches axe-core (inside the machine); Playwright runs it in the page.

    python python/main.py            (BOXLINE_API_KEY; PAGE_URL for your own page; a plan with shell sessions)

Writes output/issues.json.
"""
import json
import os
from pathlib import Path

from playwright.sync_api import sync_playwright

from boxline import Boxline

out = Path(os.environ.get("OUTPUT_DIR", "output"))
url = os.environ.get("PAGE_URL", "https://books.toscrape.com/")
AXE = "https://cdn.jsdelivr.net/npm/axe-core@4.10.2/axe.min.js"
ORDER = {"critical": 0, "serious": 1, "moderate": 2, "minor": 3}
bx = Boxline()

with bx.sessions.create(shell=True, timeout=300, user_metadata={"example": "accessibility-check"}) as session, sync_playwright() as p:
    print(f"Session: {session.id}", flush=True)
    # 1. The shell downloads axe-core into the workspace; the files API hands its source to this script.
    dl = session.exec(f"curl -sSfL --max-time 60 -o axe.min.js {AXE}")
    if dl["exitCode"] != 0:
        raise SystemExit(f"could not download axe-core: {dl['stderr'].strip()}")
    axe_source = session.files.read_text("axe.min.js")

    # 2. The browser opens the page and runs the scan in it.
    page = p.chromium.connect_over_cdp(session.connect_url).contexts[0].pages[0]
    page.goto(url, wait_until="load")
    page.evaluate(axe_source)
    violations = page.evaluate("axe.run().then((r) => r.violations)")

    issues = sorted(
        (
            {"id": v["id"], "impact": v["impact"], "count": len(v["nodes"]), "help": v["help"], "helpUrl": v["helpUrl"],
             "where": [" ".join(n["target"]) for n in v["nodes"][:5]]}
            for v in violations
        ),
        key=lambda i: ORDER.get(i["impact"], 9),
    )
    print(f"{len(issues)} kinds of issue on {page.url}:")
    for i in issues:
        print(f"  {i['impact']:<8} {i['id']} ({i['count']}): {i['help']}")

    out.mkdir(parents=True, exist_ok=True)
    (out / "issues.json").write_text(json.dumps(issues, indent=2))
    (out / "result.json").write_text(json.dumps({"url": url, "axe": AXE, "issues": issues}, indent=2))
