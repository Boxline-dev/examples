"""Wiki race: an agent gets from one Wikipedia article to another by clicking links only. The example does not take
its word for the route: it reads the pages the browser really visited from the session's log and checks every hop
with Wikipedia's API in the session's shell, then works out whether a shorter route existed.

    python python/main.py            (BOXLINE_API_KEY; START_URL, TARGET; a plan with shell sessions and agent runs)

Writes output/result.json and output/route.md.
"""
import json
import os
from pathlib import Path

from boxline import Boxline

here = Path(__file__).resolve().parent
out = Path(os.environ.get("OUTPUT_DIR", "output"))
start_url = os.environ.get("START_URL", "https://en.wikipedia.org/wiki/Coffee")
target = os.environ.get("TARGET", "Moon")
bx = Boxline()

OUTPUT = {
    "type": "object",
    "properties": {"reached": {"type": "boolean"}, "path": {"type": "array", "items": {"type": "string"}}},
    "required": ["reached", "path"],
}

with bx.sessions.create(shell=True, timeout=900, idle_timeout=300, user_metadata={"example": "wiki-race"}) as session:
    print(f"Session: {session.id}", flush=True)
    page = session.goto(start_url)
    print(f"Start: {page['title']} → target: {target}", flush=True)

    # 1. The race: links only.
    started = bx.agent.run(
        f"You are on the Wikipedia article at {start_url}. Get to the article \"{target}\" by clicking links in the "
        "articles' text, in as few clicks as you can. Rules: do not use the search box, do not type or change addresses "
        f"(no navigating to a URL), stay on this wiki. Going back from a dead end is allowed. When the \"{target}\" article "
        "is open, finish with the titles of the articles you went through, in order.",
        session_id=session.id,
        max_steps=30,
        output=OUTPUT,
    )
    print(f"Agent run {started['id']} ({started['model']}) is racing…", flush=True)
    run = bx.agent.wait(started["id"])
    if run["status"] != "completed" or not run["result"]:
        raise SystemExit(f"the run {run['status']}: {run.get('error') or 'no result'}")
    tool_steps = [s for s in run["steps"] if s["type"] == "tool"]
    clicks = sum(1 for s in tool_steps if s.get("name") == "browser_click")
    print(f"The agent says: {' → '.join(run['result']['path'])} ({clicks} clicks)", flush=True)

    # 2. What the browser really visited, from the session's log, checked hop by hop in the shell.
    visited = [e["url"] for e in session.events(types=["navigation"]) if e.get("url") and not e["url"].startswith("about:")]
    session.files.write("path.json", json.dumps({"start": start_url, "target": target, "visited": visited}))
    session.files.write("verify_path.py", (here.parent / "verify_path.py").read_bytes())
    v = session.exec("python3 verify_path.py path.json", cwd="/workspace", timeout_ms=300_000)
    if v["exitCode"] != 0:
        raise SystemExit(f"verify_path.py failed: {(v['stderr'].strip().splitlines() or ['no output'])[-1]}")
    verified = json.loads(v["stdout"])

marks = "".join(f"{h['from']} {'→' if h['linked'] else '⇢ (not a link!)'} " for h in verified["hops"]) + (verified["route"][-1] if verified["route"] else "")
sh = verified["shortest"]
short = "3 or more" if sh["hops"] == 3 else f"{sh['hops']}" + (f" (e.g. via {sh['via'][0]})" if sh["via"] else "")
print(f"Route: {marks}\n{'Reached' if verified['reached'] else 'Did not reach'} \"{verified['target']}\" in {len(verified['hops'])} hops; "
      f"{'every hop is a link on the page' if verified['allLinked'] else 'some hops are not links'}; shortest possible: {short} ({verified['apiCalls']} API calls)")

out.mkdir(parents=True, exist_ok=True)
lines = [f"# {verified['start']} → {verified['target']}", ""]
lines += [f"{i}. {h['from']} → {h['to']}" + ("" if h["linked"] else " (not a link on the page)") for i, h in enumerate(verified["hops"], 1)]
lines += ["", f"Shortest possible: {short}.", ""]
(out / "route.md").write_text("\n".join(lines))
result = {"startUrl": start_url, "target": target, "agent": run["result"], "visited": visited, "verified": verified,
          "toolSteps": [s.get("name") for s in tool_steps], "agentRuns": [{"id": run["id"]}]}
(out / "result.json").write_text(json.dumps(result, indent=2, ensure_ascii=False))
