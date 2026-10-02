"""Agent with a human in the loop: an agent that asks you when it is unsure (here: which of several books to pick),
waits for your answer, then carries on.

    python python/main.py            (BOXLINE_API_KEY; TASK for your own task)

Writes output/result.json.
"""
import json
import os
from pathlib import Path

from boxline import Boxline

out = Path(os.environ.get("OUTPUT_DIR", "output"))
task = os.environ.get(
    "TASK",
    "On https://books.toscrape.com, open the Travel category and find the books that cost less than £30. If more than one "
    "fits, don't finish yet: ask me for help to choose, and wait until I hand the browser back with my choice. Then tell "
    "me the title and price of the one I chose.",
)
bx = Boxline()

run = bx.agent.run(task, max_steps=25)
print(f"Agent run {run['id']} ({run['provider']}/{run['model']}) · Session: {run['sessionId']}", flush=True)

questions = []
for e in bx.agent.stream(run["id"]):
    if e["type"] == "thought":
        print(f"  {e['text']}")
    elif e["type"] == "tool":
        print(f"-> {e['name']} {json.dumps(e.get('input') or {}, ensure_ascii=False)[:100]}")
    elif e["type"] == "handover" and e.get("by") == "agent":
        # The run is paused: the browser is yours (watch or act in the live view), and your note goes back to the agent.
        questions.append(e.get("text") or "")
        print(f"\nThe agent asks: {e.get('text')}")
        bx.agent.hand_back(run["id"], input("Your answer: "))
    elif e["type"] == "done":
        print(f"\n{e['status']}: {e.get('result') or e.get('error')}")

done = bx.agent.get(run["id"])
out.mkdir(parents=True, exist_ok=True)
result = {"task": task, "agentRuns": [{"id": run["id"]}], "status": done["status"], "answer": done["result"], "questions": questions,
          "steps": len(done["steps"]), "model": done["model"], "costUsd": done["usage"]["costUsd"]}
(out / "result.json").write_text(json.dumps(result, indent=2, ensure_ascii=False))
