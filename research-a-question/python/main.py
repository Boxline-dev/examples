"""Research a question: an agent searches the web, reads several sources in its browser, and answers with citations.

    python python/main.py            (BOXLINE_API_KEY; QUESTION for your own question; a plan with web search)

Writes output/result.json: the answer, its sources, the searches it ran and the pages it opened.
"""
import json
import os
import re
from pathlib import Path

from boxline import Boxline

out = Path(os.environ.get("OUTPUT_DIR", "output"))
question = os.environ.get("QUESTION", "When was the James Webb Space Telescope launched, and where does it orbit?")
bx = Boxline()

run = bx.agent.run(
    f'Research this question on the web: "{question}" Use web search, open and read at least two good sources, and answer '
    'in two or three sentences. End with a line "Sources:" followed by the addresses of the pages you read, one per line.',
    max_steps=25,
)
print(f"Agent run {run['id']} ({run['provider']}/{run['model']}) · Session: {run['sessionId']}", flush=True)
for e in bx.agent.stream(run["id"]):
    if e["type"] == "tool" and e.get("name") == "web_search":
        print(f"search: {(e.get('input') or {}).get('query')}")
    elif e["type"] == "tool" and e.get("name") == "browser_navigate":
        print(f"read:   {(e.get('input') or {}).get('url')}")
    elif e["type"] == "done":
        print(f"\n{e['status']}:\n{e.get('result') or e.get('error')}")

done = bx.agent.get(run["id"])
tools = [s for s in done["steps"] if s["type"] == "tool"]
searches = [(s.get("input") or {}).get("query", "") for s in tools if s.get("name") == "web_search"]
opened = [(s.get("input") or {}).get("url", "") for s in tools if s.get("name") == "browser_navigate"]
answer = done["result"] or ""
tail = re.split(r"\bSources:", answer, flags=re.I)
sources = list(dict.fromkeys(re.findall(r"https?://[^\s)>\]]+", tail[1] if len(tail) > 1 else "")))

out.mkdir(parents=True, exist_ok=True)
result = {"question": question, "status": done["status"], "answer": answer, "sources": sources, "searches": searches, "opened": opened,
          "agentRuns": [{"id": run["id"]}], "model": done["model"], "costUsd": done["usage"]["costUsd"], "usage": {"searches": len(searches)}}
(out / "result.json").write_text(json.dumps(result, indent=2, ensure_ascii=False))
