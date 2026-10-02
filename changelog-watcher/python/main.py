"""Changelog watcher: a task reads the newest released entry of a product's changelog into JSON (version, date, title,
changes, a one-sentence summary) every morning, and the example says whether it is new since the last time it looked.
A new entry is posted to your team's chat (a Slack-style incoming webhook) when SLACK_WEBHOOK_URL is set.

    CHANGELOG_URL=https://… python python/main.py     (BOXLINE_API_KEY; SCHEDULE; KEEP_SCHEDULE=1 to leave it running;
                                                       SLACK_WEBHOOK_URL optional)

The example runs the task once right away instead of waiting for the schedule, then switches the schedule off unless
KEEP_SCHEDULE=1. The last version seen is kept in output/last-seen.json. Writes output/latest.json.
"""
import json
import os
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

from boxline import Boxline

out = Path(os.environ.get("OUTPUT_DIR", "output"))
changelog = os.environ.get("CHANGELOG_URL")
if not changelog:
    raise SystemExit("Set CHANGELOG_URL to the changelog or release notes page to watch")
cron = os.environ.get("SCHEDULE", "0 8 * * *")  # every day at 08:00 UTC
keep = os.environ.get("KEEP_SCHEDULE") == "1"
chat_hook = os.environ.get("SLACK_WEBHOOK_URL")
bx = Boxline()
out.mkdir(parents=True, exist_ok=True)

name = f"Changelog watcher: {urlparse(changelog).netloc}"[:100]
spec = dict(
    instruction=(
        "Open %changelog% and find the newest RELEASED entry of the changelog (skip anything marked unreleased or upcoming). "
        "Give its version, its release date as YYYY-MM-DD, its title, the list of changes exactly as written, and a "
        "one-sentence summary of what is new."
    ),
    variables=[{"name": "changelog", "default": changelog, "description": "The changelog page"}],
    output={
        "type": "object",
        "properties": {
            "version": {"type": "string", "minLength": 1},
            "date": {"type": "string", "description": "YYYY-MM-DD"},
            "title": {"type": "string"},
            "changes": {"type": "array", "items": {"type": "string"}, "minItems": 1},
            "summary": {"type": "string"},
        },
        "required": ["version", "date", "title", "changes", "summary"],
        "additionalProperties": False,
    },
    max_steps=10,
    schedule={"cron": cron, "timezone": "UTC", "enabled": True},
)
existing = next((t for t in bx.tasks.list(limit=100).data if t["name"] == name), None)
task = bx.tasks.update(existing["id"], name=name, **spec) if existing else bx.tasks.create(name, **spec)
schedule = {"cron": task["schedule"]["cron"], "nextRunAt": task["schedule"]["nextRunAt"], "setAt": datetime.now(timezone.utc).isoformat()}
print(f'Task {task["id"]} "{name}": runs "{cron}" (UTC), next at {schedule["nextRunAt"]}')

try:
    started = bx.tasks.run(task["id"])
    print(f"Run {started['id']} (agent run {started['runId']}) · Session: {started['sessionId']}", flush=True)
    run = bx.tasks.wait_for_run(started, timeout=300)
finally:
    if not keep:
        bx.tasks.update(task["id"], schedule={"enabled": False})
if run["status"] != "completed" or not run["result"]:
    raise SystemExit(f"the run {run['status']}: {run['error']}")
entry = run["result"]

# New since last time? (A scheduled run would do this in your task_run.finished webhook receiver.)
state_file = out / "last-seen.json"
last = json.loads(state_file.read_text()) if state_file.exists() else None
is_new = not last or last["version"] != entry["version"]
state_file.write_text(json.dumps({"version": entry["version"], "date": entry["date"], "seenAt": datetime.now(timezone.utc).isoformat()}, indent=2))
print(f"{'NEW' if is_new else 'no change'}: {entry['version']} ({entry['date']}) {entry['title']}: {entry['summary']}")
for c in entry["changes"]:
    print(f"  - {c}")

# A new entry goes to the team's chat, written like a changelog post.
posted = False
if is_new and chat_hook:
    text = "\n".join([f"New release at {changelog}: *{entry['version']}* ({entry['date']}) {entry['title']}", "", entry["summary"], "", *(f"• {c}" for c in entry["changes"])])
    req = urllib.request.Request(chat_hook, data=json.dumps({"text": text}).encode(), headers={"content-type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30):
            posted = True
            print("Posted the new entry to the chat webhook.")
    except Exception as err:
        print(f"The chat webhook failed: {err}")

(out / "latest.json").write_text(json.dumps(entry, indent=2, ensure_ascii=False))
result = {"changelog": changelog, "task": {"id": task["id"], "name": name, "schedule": schedule, "enabledAtEnd": keep},
          "run": {"id": run["id"], "status": run["status"]}, "entry": entry, "isNew": is_new, "previous": last["version"] if last else None, "posted": posted,
          "agentRuns": [{"id": run["runId"]}], "made": {"tasks": [task["id"]]}}
(out / "result.json").write_text(json.dumps(result, indent=2, ensure_ascii=False))
