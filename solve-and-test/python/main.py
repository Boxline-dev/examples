"""Solve and test: an agent solves a programming exercise in a session's shell and runs the exercise's tests until they
pass; then the example runs the tests again itself, from a fresh copy, so the result does not rest on the agent's word.
The exercises and their test cases are Exercism's problem-specifications (MIT).

    python python/main.py            (BOXLINE_API_KEY; EXERCISE, e.g. roman-numerals; a plan with shell sessions)

The agent works in a session without a browser: only the shell, in the machine. Writes output/solution.py and
output/result.json.
"""
import json
import os
import re
from pathlib import Path

from boxline import Boxline

here = Path(__file__).resolve().parent
out = Path(os.environ.get("OUTPUT_DIR", "output"))
exercise = os.environ.get("EXERCISE", "roman-numerals")
if not re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", exercise):
    raise SystemExit(f'EXERCISE is a slug like roman-numerals, not "{exercise}"')
specs = f"https://raw.githubusercontent.com/exercism/problem-specifications/main/exercises/{exercise}"
runner = (here.parent / "run_tests.py").read_bytes()
bx = Boxline()


def fetch_exercise(folder: str) -> str:
    """Downloads the exercise into a folder of the workspace (the address as a variable, not inside the command)."""
    return (
        f'mkdir -p {folder} && cd {folder} && curl -sSfL --max-time 60 -o instructions.md "$SPECS/instructions.md" && '
        'curl -sSfL --max-time 60 -o canonical-data.json "$SPECS/canonical-data.json" && sha256sum canonical-data.json run_tests.py'
    )


OUTPUT = {
    "type": "object",
    "properties": {"passed": {"type": "integer"}, "total": {"type": "integer"}, "approach": {"type": "string"}},
    "required": ["passed", "total", "approach"],
}

with bx.sessions.create(browser=False, shell=True, timeout=900, idle_timeout=300, user_metadata={"example": "solve-and-test"}) as session:
    print(f"Session: {session.id}", flush=True)
    # 1. The exercise, its test cases and the test runner go into the machine.
    session.files.write("exercise/run_tests.py", runner)
    got = session.exec(f"{fetch_exercise('exercise')} && python3 run_tests.py --signatures", env={"SPECS": specs}, cwd="/workspace", timeout_ms=120_000)
    if got["exitCode"] != 0:
        raise SystemExit(f'no exercise "{exercise}": {got["stderr"].strip()}')
    lines = got["stdout"].strip().split("\n")
    hashes, signatures = "\n".join(lines[:2]), lines[2:]
    print(f"Exercise {exercise}: {'; '.join(signatures)}", flush=True)

    # 2. An agent solves it in the same session: it reads, writes solution.py, runs the tests, fixes, until all pass.
    started = bx.agent.run(
        "In /workspace/exercise, instructions.md describes a programming exercise. Write the solution in Python in "
        "/workspace/exercise/solution.py with these functions:\n" + "\n".join(signatures) + "\n"
        "Run the tests with `cd /workspace/exercise && python3 run_tests.py` (it prints JSON with the failed cases) and "
        "fix the solution until every test passes. Do not change run_tests.py or canonical-data.json. Use only Python's "
        "standard library. When done, report the last test run's numbers and your approach in two sentences.",
        session_id=session.id,
        max_steps=25,
        output=OUTPUT,
    )
    print(f"Agent run {started['id']} ({started['model']}) is solving it…", flush=True)
    run = bx.agent.wait(started["id"])
    if run["status"] != "completed" or not run["result"]:
        raise SystemExit(f"the run {run['status']}: {run.get('error') or 'no result'}")
    claim = run["result"]
    tool_steps = [s for s in run["steps"] if s["type"] == "tool"]
    print(f"The agent says {claim['passed']}/{claim['total']} pass after {len(tool_steps)} tool steps: {claim['approach']}", flush=True)

    # 3. The tests again, run by the example from a fresh download in another folder, with only solution.py copied over.
    #    The agent's copies of the tests are compared with the originals too. (The agent shares the session's shell, so
    #    its last `cd` would carry over: every command here names its folder with `cwd`.)
    session.files.write("check/run_tests.py", runner)
    verify = session.exec(
        f"{fetch_exercise('check')} >/dev/null && cp ../exercise/solution.py . && "
        "(cd ../exercise && sha256sum canonical-data.json run_tests.py) > ../agent-hashes.txt && python3 run_tests.py",
        env={"SPECS": specs},
        cwd="/workspace",
        timeout_ms=120_000,
    )
    last = (verify["stdout"].strip().split("\n") or [""])[-1]
    if not last.startswith("{"):
        raise SystemExit(f"the tests did not run: {verify['stderr'].strip() or 'no solution.py'}")
    tests = json.loads(last)
    tests_changed = session.files.read_text("agent-hashes.txt").strip() != hashes.strip()
    print(f"Run again by the example: {tests['passed']}/{tests['total']} pass" + (" (the agent changed the tests!)" if tests_changed else "; the agent left the tests as they were"))

    out.mkdir(parents=True, exist_ok=True)
    solution = session.files.read_text("exercise/solution.py")
    (out / "solution.py").write_text(solution)
    result = {
        "exercise": exercise,
        "source": specs,
        "signatures": signatures,
        "agent": claim,
        "tests": tests,
        "testsChanged": tests_changed,
        "solutionLines": len(solution.strip().split("\n")),
        "toolSteps": [{"name": s.get("name"), "input": s.get("input")} for s in tool_steps],
        "agentRuns": [{"id": run["id"]}],
    }
    (out / "result.json").write_text(json.dumps(result, indent=2, ensure_ascii=False))
