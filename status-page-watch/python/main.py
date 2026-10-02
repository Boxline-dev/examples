"""Status page watch: read the official status pages of the services you depend on, in one shape whatever their
format (overall state, components, open incidents), and post to your chat when something changes: a component
degraded or back, an incident opened or resolved. Each alert comes with a screenshot of the page.

    python python/main.py            (BOXLINE_API_KEY; PAGES comma-separated, SLACK_WEBHOOK_URL; RUNS, INTERVAL_SECONDS)

The last state of each page is kept in STATE_DIR between runs (run it from cron for a schedule). Writes
output/result.json, output/alerts.md and output/<page>-<round>.png for each change.
"""
import hashlib
import json
import os
import re
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

from boxline import Boxline

out = Path(os.environ.get("OUTPUT_DIR", "output"))
state_dir = Path(os.environ.get("STATE_DIR", str(out / "state")))
pages = [u.strip() for u in os.environ.get("PAGES", "https://www.githubstatus.com/,https://status.npmjs.org/").split(",") if u.strip()][:10]
runs = int(os.environ.get("RUNS", "1"))
interval = int(os.environ.get("INTERVAL_SECONDS", "300"))
chat_hook = os.environ.get("SLACK_WEBHOOK_URL")
bx = Boxline()

LEVELS = ["operational", "degraded", "partial_outage", "major_outage", "maintenance", "unknown"]


def state_file(url: str) -> Path:
    return state_dir / f"{hashlib.sha256(url.encode()).hexdigest()[:16]}.json"


def changes(a, b):
    """What changed between two readings of a page, in plain words."""
    c = []
    if a["overall"] != b["overall"]:
        c.append(f"overall: {a['overall']} → {b['overall']}")
    before = {x["name"].lower(): x["status"] for x in a["components"]}
    for x in b["components"]:
        was = before.get(x["name"].lower())
        if was and was != x["status"]:
            c.append(f"{x['name']}: {was} → {x['status']}")
    titles_a = {i["title"].lower() for i in a["incidents"]}
    titles_b = {i["title"].lower() for i in b["incidents"]}
    c += [f"new incident: {i['title']} ({i['status']})" for i in b["incidents"] if i["title"].lower() not in titles_a]
    c += [f"resolved: {i['title']}" for i in a["incidents"] if i["title"].lower() not in titles_b]
    return c


SCHEMA = {
    "type": "object",
    "properties": {
        "pages": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "url": {"type": "string"},
                    "service": {"type": "string"},
                    "overall": {"type": "string", "enum": LEVELS},
                    "components": {"type": "array", "items": {"type": "object", "properties": {"name": {"type": "string"}, "status": {"type": "string", "enum": LEVELS}}, "required": ["name", "status"]}},
                    "incidents": {"type": "array", "items": {"type": "object", "properties": {"title": {"type": "string"}, "status": {"type": "string"}}, "required": ["title", "status"]}},
                },
                "required": ["url", "service", "overall", "components", "incidents"],
            },
        }
    },
    "required": ["pages"],
}

state_dir.mkdir(parents=True, exist_ok=True)
out.mkdir(parents=True, exist_ok=True)
rounds, alerts_sent, model_usd = [], 0, 0.0
for rnd in range(1, runs + 1):
    at = datetime.now(timezone.utc).isoformat()
    # Every page in one call, read into the same shape (status words mapped onto a fixed scale).
    r = bx.extract(
        urls=pages,
        prompt=(
            "Each page is a service's status page. service: its name. overall: the service's current state. components: each component listed with its current state. "
            "incidents: only incidents that are still open (not resolved), with their title and stage (e.g. investigating, identified, monitoring). Map every state onto: "
            "operational, degraded (degraded performance), partial_outage, major_outage, maintenance, or unknown. url: the page's address as given."
        ),
        schema=SCHEMA,
    )
    model_usd += r["usage"]["costUsd"]
    seen, alerts = [], []
    for i, url in enumerate(pages):
        now = next((p for p in r["data"]["pages"] if p["url"] == url), None) or (r["data"]["pages"][i] if i < len(r["data"]["pages"]) else None)
        page = r["pages"][i] if i < len(r["pages"]) else {}
        if not now or page.get("error"):
            seen.append({"url": url, "overall": "unknown", "changes": [f"could not be read: {(page.get('error') or {}).get('code', 'no data')}"]})
            continue
        f = state_file(url)
        before = json.loads(f.read_text()) if f.exists() else None
        diff = changes(before, now) if before else []
        f.write_text(json.dumps(now, indent=2))
        row = {"url": url, "overall": now["overall"], "changes": diff}
        if diff:
            # Evidence for the alert: how the page looked when the change was seen.
            name = f"{re.sub(r'[^a-z0-9]+', '-', urlparse(url).netloc, flags=re.I)}-{rnd}.png"
            (out / name).write_bytes(bx.screenshot(url, full_page=True))
            row["screenshot"] = name
            alerts.append(f"*{now['service']}* is {now['overall'].replace('_', ' ')} ({url})\n" + "\n".join(f"• {d}" for d in diff))
        seen.append(row)
        print(f"  {now['overall']:<14} {now['service']}" + "".join(f"\n                 {d}" for d in diff))
    rounds.append({"round": rnd, "at": at, "pages": seen})
    if alerts:
        text = f"Status changes ({at[:16].replace('T', ' ')} UTC)\n\n" + "\n\n".join(alerts)
        path = out / "alerts.md"
        path.write_text((path.read_text() + "\n\n" if path.exists() else "") + text)
        if chat_hook:
            req = urllib.request.Request(chat_hook, data=json.dumps({"text": text}).encode(), headers={"content-type": "application/json"}, method="POST")
            try:
                with urllib.request.urlopen(req, timeout=30):
                    alerts_sent += 1
                    print("  posted the changes to the chat webhook")
            except Exception as err:
                print(f"  the chat webhook failed: {err}")
    print(f"Round {rnd} done: {sum(1 for p in seen if p['changes'])} pages changed.", flush=True)
    if rnd == 1 and any(p["overall"] != "unknown" for p in seen):
        print("Baseline saved.", flush=True)
    if rnd < runs:
        time.sleep(interval)

(out / "result.json").write_text(json.dumps({"pages": pages, "rounds": rounds, "alertsSent": alerts_sent, "usage": {"modelUsd": model_usd}}, indent=2, ensure_ascii=False))
