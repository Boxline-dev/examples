"""Docs to working code: an agent reads an HTTP API's documentation in the session's browser, writes a Python client
for a goal in the session's shell, runs it and fixes it until it works. Then the example runs the script itself, so
what you get is code that has been run, with its real output.

    python python/main.py            (BOXLINE_API_KEY; DOCS_URL, GOAL; a plan with shell sessions and agent runs)

Writes output/client.py, output/client-output.json and output/result.json.
"""
import json
import os
from pathlib import Path

from boxline import Boxline

out = Path(os.environ.get("OUTPUT_DIR", "output"))
docs_url = os.environ.get("DOCS_URL", "https://frankfurter.dev/")
goal = os.environ.get(
    "GOAL",
    "Print as JSON the euro's reference rates for USD, GBP and JPY on 2026-10-01, and for each the percent change since 2026-09-01 (rounded to 2 decimals).",
)
bx = Boxline()

OUTPUT = {
    "type": "object",
    "properties": {"endpoints": {"type": "array", "items": {"type": "string"}}, "summary": {"type": "string"}},
    "required": ["endpoints", "summary"],
}

with bx.sessions.create(shell=True, timeout=900, idle_timeout=300, user_metadata={"example": "docs-to-working-code"}) as session:
    print(f"Session: {session.id}", flush=True)
    # 1. The docs open in the browser (pages built by JavaScript work too); the agent reads them there.
    page = session.goto(docs_url)
    print(f"Docs: {page['title']} ({docs_url})", flush=True)

    # 2. The agent writes the client in the same session's shell and runs it until it works.
    started = bx.agent.run(
        f"The documentation of an HTTP API is open in the browser ({docs_url}). Read it there: scroll, and follow its links "
        "if the part you need is on another page. Then write a Python 3 script, /workspace/client.py (the requests package "
        f"is installed), that does this:\n\n{goal}\n\nThe script prints exactly one JSON document to stdout and nothing "
        "else. Take addresses, keys and parameters from the documentation. Run it with `python3 /workspace/client.py`, "
        "check its output against the goal, and fix it until it is right. Finish with the endpoints it calls and two "
        "sentences on what it does.",
        session_id=session.id,
        max_steps=30,
        output=OUTPUT,
    )
    print(f"Agent run {started['id']} ({started['model']}) is reading the docs and writing the client…", flush=True)
    run = bx.agent.wait(started["id"])
    if run["status"] != "completed" or not run["result"]:
        raise SystemExit(f"the run {run['status']}: {run.get('error') or 'no result'}")
    tool_steps = [s for s in run["steps"] if s["type"] == "tool"]
    print(f"{len(tool_steps)} tool steps: {run['result']['summary']}", flush=True)

    # 3. The example runs the script itself (from /workspace: the agent's last `cd` would carry over otherwise).
    ran = session.exec("python3 client.py", cwd="/workspace", timeout_ms=120_000)
    try:
        output = json.loads(ran["stdout"])
    except ValueError:
        output = None  # not JSON: the check says so
    print(f"Ran client.py: exit {ran['exitCode']}" + (", output is not JSON" if output is None else "") + f"\n{ran['stdout'].strip()[:1500]}")

    out.mkdir(parents=True, exist_ok=True)
    script = session.files.read_text("client.py")
    (out / "client.py").write_text(script)
    (out / "client-output.json").write_text(ran["stdout"])
    result = {
        "docsUrl": docs_url,
        "goal": goal,
        "agent": run["result"],
        "run": {"exitCode": ran["exitCode"], "stderr": ran["stderr"][-2000:], "output": output},
        "scriptLines": len(script.strip().split("\n")),
        "toolSteps": [{"name": s.get("name"), "input": json.dumps(s.get("input") or {})[:300]} for s in tool_steps],
        "agentRuns": [{"id": run["id"]}],
    }
    (out / "result.json").write_text(json.dumps(result, indent=2, ensure_ascii=False))
