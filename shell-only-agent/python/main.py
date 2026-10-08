"""Shell-only agent: an agent run in its own session with no browser, only a shell. It generates a CSV by a rule, computes
statistics from it with Python and writes a report; then the example reads the files back (``files.read_text``) and
recomputes every number itself, so the result does not rest on the agent's word.

    python python/main.py            (BOXLINE_API_KEY; a plan with shell sessions and agent runs)

The data is made up by a rule (no site is visited). Writes output/sales.csv, output/stats.json, output/report.md and
output/result.json.
"""
import json
import os
import statistics
from pathlib import Path

from boxline import Boxline

out = Path(os.environ.get("OUTPUT_DIR", "output"))
bx = Boxline()

# The rule the agent follows, and the example checks against.
ROWS = 240
REGIONS = ["north", "south", "east", "west"]


def rule(i: int) -> dict:
    return {"id": i, "region": REGIONS[i % 4], "units": (i * 37) % 23 + 1, "price": 4.5 + (i % 5) * 1.25}


def expected_stats() -> dict:
    """The numbers the agent should find, from the rule alone."""
    rows = [rule(i) for i in range(1, ROWS + 1)]
    by_region = {r: round(sum(x["units"] * x["price"] for x in rows if x["region"] == r), 2) for r in REGIONS}
    units = [x["units"] for x in rows]
    return {
        "total_units": sum(units),
        "total_revenue": round(sum(x["units"] * x["price"] for x in rows), 2),
        "revenue_by_region": by_region,
        "top_region": max(by_region, key=by_region.get),
        "units_mean": round(statistics.mean(units), 2),
        "units_median": statistics.median(units),
        "units_stdev": round(statistics.pstdev(units), 2),
    }


TASK = (
    "Work in /workspace with Python 3 (standard library only). Do these three things, in this order:\n"
    f'1. Write sales.csv with the header "id,region,units,unit_price" and one row for each i from 1 to {ROWS}: '
    'id = i, region = ["north", "south", "east", "west"][i % 4], units = (i * 37) % 23 + 1, unit_price = 4.50 + (i % 5) * 1.25 (two decimals).\n'
    "2. Read sales.csv back with a Python script and write stats.json with these keys: total_units (integer), total_revenue "
    "(the sum of units * unit_price), revenue_by_region (an object with the four regions), top_region (the region with the highest revenue), "
    "units_mean, units_median and units_stdev (the population standard deviation, statistics.pstdev). Round every decimal to 2 places.\n"
    "3. Write report.md: a heading, a table of revenue by region, and one sentence that names the top region and the total revenue "
    "with two decimals. Take every number from stats.json.\n"
    "When all three files exist, reply with one sentence."
)

started = bx.agent.run(
    TASK,
    # The run's own session: no browser, only a shell. keep_session leaves it running so the files can be read.
    session={"browser": False, "shell": True, "timeout": 900, "idleTimeout": 300, "userMetadata": {"example": "shell-only-agent"}},
    keep_session=True,
    max_steps=20,
)
session_id = started["sessionId"]
print(f"Session: {session_id}", flush=True)
print(f"Agent run {started['id']} ({started['model']}) is working in a shell-only session…", flush=True)
try:
    run = bx.agent.wait(started["id"])
    if run["status"] != "completed":
        raise SystemExit(f"the run {run['status']}: {run.get('error') or 'no result'}")
    tool_steps = [s for s in run["steps"] if s["type"] == "tool"]
    print(f"The agent finished after {len(tool_steps)} tool steps: {str(run['result'])[:200]}", flush=True)

    # The files the agent wrote, read through the API.
    csv = bx.sessions.files.read_text(session_id, "sales.csv")
    reported = json.loads(bx.sessions.files.read_text(session_id, "stats.json"))
    report = bx.sessions.files.read_text(session_id, "report.md")

    lines = csv.strip().splitlines()  # also \r\n, which Python's csv module writes
    matches_rule = lines[0] == "id,region,units,unit_price" and len(lines) == ROWS + 1
    if matches_rule:
        for k, line in enumerate(lines[1:]):
            id_, region, units, price = line.split(",")
            want = rule(k + 1)
            if not (int(id_) == want["id"] and region == want["region"] and int(units) == want["units"] and abs(float(price) - want["price"]) < 1e-9):
                matches_rule = False
                break
    expected = expected_stats()
    print(f"sales.csv: {len(lines) - 1} rows" + (", as the rule says" if matches_rule else ", NOT as the rule says"))
    print(f"The agent's total revenue {reported.get('total_revenue')}, expected {expected['total_revenue']}; top region {reported.get('top_region')}, expected {expected['top_region']}")

    # What kind of session the run made.
    session = bx.sessions.get(session_id).data
    print(f"The run's session: browser {session['browser']}, shell {session['shell']}, liveUrl {session['liveUrl']}")

    out.mkdir(parents=True, exist_ok=True)
    (out / "sales.csv").write_text(csv)
    (out / "stats.json").write_text(json.dumps(reported, indent=2))
    (out / "report.md").write_text(report)
    result = {
        "csv": {"rows": len(lines) - 1, "matchesRule": matches_rule},
        "expected": expected,
        "reported": reported,
        "report": report,
        "session": {"id": session["id"], "browser": session["browser"], "shell": session["shell"], "liveUrl": session["liveUrl"]},
        "toolSteps": [{"name": s.get("name"), "input": s.get("input")} for s in tool_steps],
        "agentRuns": [{"id": run["id"]}],
    }
    (out / "result.json").write_text(json.dumps(result, indent=2, ensure_ascii=False))
finally:
    try:
        bx.sessions.stop(session_id)
    except Exception:
        pass
