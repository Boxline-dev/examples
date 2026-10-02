"""Computer use: the agent drives the browser the way a person does, from screenshots with the mouse and keyboard
(the model provider's own computer-use tool), instead of reading the page's structure.

    python python/main.py            (BOXLINE_API_KEY; TASK for your own task)

Writes output/result.json with the answer and the actions the model took.
"""
import json
import os
from pathlib import Path

from boxline import Boxline

out = Path(os.environ.get("OUTPUT_DIR", "output"))
task = os.environ.get("TASK", "On https://books.toscrape.com, open the Poetry category and tell me the title and price of the cheapest book in it.")
bx = Boxline()

# A model with a computer-use tool: the configured default when it has one, else the first that does.
catalog = bx.agent.models()
choices = [(p["id"], m["id"]) for p in catalog["providers"] if p["available"] for m in p["models"] if m.get("supportsComputerUse")]
default = (catalog["default"]["provider"], catalog["default"]["model"])
if not choices:
    raise SystemExit("no configured model has a computer-use tool (see bx.agent.models())")
provider, model = default if default in choices else choices[0]

run = bx.agent.run(task, mode="computer", provider=provider, model=model, max_steps=40)
print(f"Agent run {run['id']} ({run['provider']}/{run['model']}, computer mode) · Session: {run['sessionId']}", flush=True)
for e in bx.agent.stream(run["id"]):
    if e["type"] == "thought":
        print(f"  {e['text']}")
    elif e["type"] == "tool":
        print(f"-> {e['name']} {json.dumps(e.get('input') or {})[:110]}")
    elif e["type"] == "done":
        print(f"\n{e['status']}: {e.get('result') or e.get('error')}")

done = bx.agent.get(run["id"])
actions = [s.get("input") for s in done["steps"] if s["type"] == "tool" and s.get("name") == "computer"]
out.mkdir(parents=True, exist_ok=True)
result = {"task": task, "mode": done["mode"], "model": done["model"], "status": done["status"], "answer": done["result"], "computerActions": len(actions),
          "actions": actions, "agentRuns": [{"id": run["id"]}], "costUsd": done["usage"]["costUsd"]}
(out / "result.json").write_text(json.dumps(result, indent=2, ensure_ascii=False))
