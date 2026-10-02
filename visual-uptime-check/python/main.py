"""Visual uptime check, in two parts:
1. A load check, no model: each page opened in a real browser and timed. Up, slow (over SLOW_MS), or down: an error
   status, or no page at all with the reason (the name does not resolve, a certificate problem, refused, no answer).
2. A task opens each page, takes a screenshot and looks at it, and reports whether it looks broken (an error message,
   a blank page, missing images), on a schedule: a page can load fine and still be broken.
A screenshot of each page is also saved here for the record.

    PAGES=https://…,https://… python python/main.py    (BOXLINE_API_KEY; SLOW_MS; SCHEDULE; KEEP_SCHEDULE=1 to leave it running)

The example runs the task once right away instead of waiting for the schedule, then switches the schedule off unless
KEEP_SCHEDULE=1 (a check every 15 minutes costs a model run each time). Writes output/status.json, output/load.json
and output/shots/.
"""
import json
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

from boxline import Boxline, BoxlineError

out = Path(os.environ.get("OUTPUT_DIR", "output"))
pages = [p.strip() for p in os.environ.get("PAGES", "https://books.toscrape.com/,https://quotes.toscrape.com/").split(",") if p.strip()]
cron = os.environ.get("SCHEDULE", "*/15 * * * *")
keep = os.environ.get("KEEP_SCHEDULE") == "1"
slow_ms = int(os.environ.get("SLOW_MS", "5000"))
bx = Boxline()

# 1. The load check: each page in a real browser, timed (from here, so it includes the trip to the API).
REASONS = [
    (r"ERR_NAME_NOT_RESOLVED|does not resolve", "the name does not resolve (DNS)"),
    (r"ERR_CERT_|ERR_SSL_", "a certificate or TLS problem"),
    (r"ERR_CONNECTION_REFUSED|refused the connection", "the server refused the connection"),
    (r"(?i)ERR_CONNECTION_TIMED_OUT|ERR_TIMED_OUT|could not be reached|timeout", "the server did not answer"),
]
load = []
with bx.sessions.create(timeout=600, user_metadata={"example": "visual-uptime-check"}) as browser:
    print(f"Load check · Session: {browser.id}", flush=True)
    for url in pages:
        t0 = time.monotonic()
        try:
            r = browser.goto(url)
            load_ms = round((time.monotonic() - t0) * 1000)
            failed = r["status"] is not None and r["status"] >= 400
            slow = not failed and load_ms > slow_ms
            reason = f"HTTP {r['status']}" if failed else f"{load_ms / 1000:.1f} s to load" if slow else None
            load.append({"url": url, "state": "down" if failed else "slow" if slow else "up", "loadMs": load_ms, "httpStatus": r["status"], "reason": reason})
        except BoxlineError as err:
            message = str(err)
            why = next((w for pattern, w in REASONS if re.search(pattern, message)), None)
            code = re.search(r"ERR_[A-Z_]+", message)
            reason = f"{code.group(0) if code else 'no page'}: {why}" if why else re.sub(r"^page\.goto:\s*", "", message)[:200]
            load.append({"url": url, "state": "down", "loadMs": round((time.monotonic() - t0) * 1000), "httpStatus": None, "reason": reason})
for item in load:
    print(f"{item['state'].upper():<5} {item['loadMs']:>6} ms  {item['url']}" + (f"  ({item['reason']})" if item["reason"] else ""))
print(f"Load check: {sum(i['state'] == 'up' for i in load)} up · {sum(i['state'] == 'slow' for i in load)} slow · {sum(i['state'] == 'down' for i in load)} down\n", flush=True)

name = f"Visual uptime check: {urlparse(pages[0]).netloc}"[:100]
spec = dict(
    instruction=(
        "Check each of these pages, one at a time: %pages%. For each one: open it, note the HTTP status, take a screenshot and "
        "look at it. A page is up when it loads with a 2xx status. It looks broken when the screenshot shows an error message, "
        "a blank or half-drawn page, or missing images. Describe what you see in one sentence."
    ),
    variables=[{"name": "pages", "default": ", ".join(pages), "description": "The pages to check, comma-separated"}],
    output={
        "type": "object",
        "properties": {
            "pages": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "url": {"type": "string"},
                        "httpStatus": {"type": ["integer", "null"]},
                        "up": {"type": "boolean"},
                        "looksBroken": {"type": "boolean"},
                        "note": {"type": "string"},
                    },
                    "required": ["url", "httpStatus", "up", "looksBroken", "note"],
                    "additionalProperties": False,
                },
            }
        },
        "required": ["pages"],
        "additionalProperties": False,
    },
    max_steps=20,
    schedule={"cron": cron, "timezone": "UTC", "enabled": True},
)
existing = next((t for t in bx.tasks.list(limit=100).data if t["name"] == name), None)
task = bx.tasks.update(existing["id"], name=name, **spec) if existing else bx.tasks.create(name, **spec)
schedule = {"cron": task["schedule"]["cron"], "nextRunAt": task["schedule"]["nextRunAt"], "setAt": datetime.now(timezone.utc).isoformat()}
print(f'Task {task["id"]} "{name}": runs "{cron}" (UTC), next at {schedule["nextRunAt"]}')

try:
    # Run it now instead of waiting for the schedule.
    started = bx.tasks.run(task["id"])
    print(f"Run {started['id']} (agent run {started['runId']}) · Session: {started['sessionId']}", flush=True)
    run = bx.tasks.wait_for_run(started, timeout=480)
finally:
    if not keep:
        bx.tasks.update(task["id"], schedule={"enabled": False})
if run["status"] != "completed" or not run["result"]:
    raise SystemExit(f"the check {run['status']}: {run['error']}")
for p in run["result"]["pages"]:
    state = ("BROKEN" if p["looksBroken"] else "up    ") if p["up"] else "DOWN  "
    print(f"{state}  {p['httpStatus'] or '-'}  {p['url']}  {p['note']}")

# A screenshot of each page for the record (one call each, in a fresh browser).
(out / "shots").mkdir(parents=True, exist_ok=True)
shots = []
for i, url in enumerate(pages, start=1):
    try:
        png = bx.screenshot(url, timeout_ms=30_000)
    except BoxlineError:
        continue
    (out / f"shots/{i}.png").write_bytes(png)
    shots.append(f"shots/{i}.png")
agent_run = bx.agent.get(run["runId"])
screenshots_taken = sum(1 for s in agent_run["steps"] if s["type"] == "tool" and s.get("name") in ("browser_screenshot", "computer"))
if keep:
    print(f"The schedule stays on: next run at {bx.tasks.get(task['id'])['schedule']['nextRunAt']}")
else:
    print("The schedule is switched off; KEEP_SCHEDULE=1 leaves it on.")

(out / "status.json").write_text(json.dumps(run["result"], indent=2, ensure_ascii=False))
(out / "load.json").write_text(json.dumps(load, indent=2, ensure_ascii=False))
result = {
    "pages": pages,
    "slowMs": slow_ms,
    "load": load,
    "task": {"id": task["id"], "name": name, "schedule": schedule, "enabledAtEnd": keep},
    "run": {"id": run["id"], "status": run["status"], "result": run["result"], "screenshotsTaken": screenshots_taken},
    "shots": shots,
    "agentRuns": [{"id": run["runId"]}],
    "made": {"tasks": [task["id"]]},
}
(out / "result.json").write_text(json.dumps(result, indent=2, ensure_ascii=False))
