"""Watch a price: a task reads a product's price and stock into a fixed shape (an output schema), a schedule runs it
every hour, and each finished run goes to your webhook receiver (task_run.finished), which compares the price with the
last one it saw.

    python python/main.py      (BOXLINE_API_KEY; PRODUCT_URL, SCHEDULE, RUNS; KEEP_SCHEDULE=1 to leave it running)

The example starts the receiver (receiver.py) in this process and runs the task right away RUNS times instead of
waiting for the schedule. Because this receiver stops with the example, it switches the schedule off at the end unless
KEEP_SCHEDULE=1 (run receiver.py on a public HTTPS address for that). Writes output/result.json.
"""
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).parent))
from receiver import Receiver  # noqa: E402

from boxline import Boxline  # noqa: E402

out = Path(os.environ.get("OUTPUT_DIR", "output"))
product_url = os.environ.get("PRODUCT_URL", "https://books.toscrape.com/catalogue/sapiens-a-brief-history-of-humankind_996/index.html")
cron = os.environ.get("SCHEDULE", "0 * * * *")  # every hour, on the hour (at most every 5 minutes)
runs = int(os.environ.get("RUNS", "1"))
keep = os.environ.get("KEEP_SCHEDULE") == "1"
bx = Boxline()
out.mkdir(parents=True, exist_ok=True)

# 1. The receiver, and a webhook endpoint for it. Its secret is shown only now: the receiver keeps it in memory.
receiver = Receiver(out / "last-price.json")
endpoint = bx.webhooks.create(receiver.url, ["task_run.finished"], description="Watch a price (example)")
receiver.secret = endpoint["secret"]
print(f"Webhook endpoint {endpoint['id']} -> {receiver.url}")

# 2. The task and its schedule; running the example again updates the task of the same name.
parts = [p for p in urlparse(product_url).path.split("/") if p]
name = f"Watch a price: {parts[-2] if len(parts) >= 2 else product_url}"[:100]
spec = dict(
    instruction="Open %url% and read the product on it: its title, its price as a number, the currency, and whether it is in stock.",
    variables=[{"name": "url", "default": product_url, "description": "The product page"}],
    output={
        "type": "object",
        "properties": {
            "title": {"type": "string", "minLength": 1},
            "price": {"type": "number", "exclusiveMinimum": 0},
            "currency": {"type": "string", "description": "ISO 4217 code, e.g. GBP"},
            "inStock": {"type": "boolean"},
        },
        "required": ["title", "price", "currency", "inStock"],
        "additionalProperties": False,
    },
    max_steps=10,
    schedule={"cron": cron, "timezone": "UTC", "enabled": True},
)
existing = next((t for t in bx.tasks.list(limit=100).data if t["name"] == name), None)
task = bx.tasks.update(existing["id"], name=name, **spec) if existing else bx.tasks.create(name, **spec)
schedule = {**{k: task["schedule"][k] for k in ("cron", "timezone", "nextRunAt")}, "setAt": datetime.now(timezone.utc).isoformat()}
print(f'Task {task["id"]} "{name}": runs "{cron}" (UTC), next at {schedule["nextRunAt"]}')

# 3. Run it now instead of waiting for the schedule; each finished run's webhook reaches the receiver.
done = []
try:
    for _ in range(runs):
        started = bx.tasks.run(task["id"])
        print(f"Run {started['id']} (agent run {started['runId']}) · Session: {started['sessionId']}", flush=True)
        run = bx.tasks.wait_for_run(started, timeout=300)
        print(f"  {run['status']}: {json.dumps(run['result'])}")
        delivery = receiver.wait_for(run["id"], 90)
        done.append({"taskRunId": run["id"], "runId": run["runId"], "status": run["status"], "result": run["result"],
                     "costUsd": run["usage"]["costUsd"], "webhook": delivery["message"]})
finally:
    receiver.close()
    bx.webhooks.delete(endpoint["id"])  # this receiver is gone
    if not keep:
        bx.tasks.update(task["id"], schedule={"enabled": False})
after = bx.tasks.get(task["id"])
if keep:
    print(f"The schedule stays on: next run at {after['schedule']['nextRunAt']}")
else:
    print("The schedule is switched off (this receiver stopped); KEEP_SCHEDULE=1 leaves it on.")

result = {
    "productUrl": product_url,
    "task": {"id": task["id"], "name": name, "schedule": schedule, "enabledAtEnd": bool(after["schedule"] and after["schedule"]["enabled"])},
    "runs": done,
    "deliveries": receiver.deliveries,
    "agentRuns": [{"id": r["runId"]} for r in done if r["runId"]],
    "made": {"tasks": [task["id"]], "webhooks": [endpoint["id"]]},
}
(out / "result.json").write_text(json.dumps(result, indent=2, ensure_ascii=False))
