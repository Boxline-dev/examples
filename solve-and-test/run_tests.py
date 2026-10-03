"""Runs in the session's shell: the exercise's canonical test cases (Exercism problem-specifications,
canonical-data.json) against solution.py, without any test framework.

    python3 run_tests.py               every case; JSON {exercise, total, passed, failed: [...]}; exit 0 when all pass
    python3 run_tests.py --signatures  the functions solution.py needs, with their arguments

Each case calls solution.<property>(**input) (camelCase names become snake_case) and compares the return value with
"expected"; an expected {"error": "..."} means the call must raise an exception. A case another case "reimplements"
is skipped, as Exercism's own test generators do."""
import importlib
import json
import re
import sys
import traceback

data = json.load(open("canonical-data.json"))


def snake(name):
    return re.sub(r"(?<!^)(?=[A-Z])", "_", name).lower()


def flatten(cases, path=()):
    for c in cases:
        if "cases" in c:
            yield from flatten(c["cases"], path + (c.get("description", ""),))
        else:
            yield {**c, "path": " / ".join(p for p in path + (c["description"],) if p)}


cases = list(flatten(data["cases"]))
replaced = {c["reimplements"] for c in cases if "reimplements" in c}
cases = [c for c in cases if c.get("uuid") not in replaced]

if "--signatures" in sys.argv:
    seen = {}
    for c in cases:
        seen.setdefault(snake(c["property"]), [snake(k) for k in c.get("input", {})])
    for name, args in seen.items():
        print(f"def {name}({', '.join(args)}): ...")
    sys.exit(0)

try:
    solution = importlib.import_module("solution")
except Exception:
    print(json.dumps({"exercise": data["exercise"], "total": len(cases), "passed": 0, "error": traceback.format_exc(limit=2)}))
    sys.exit(1)

failed = []
for c in cases:
    fn = getattr(solution, snake(c["property"]), None)
    want = c["expected"]
    wants_error = isinstance(want, dict) and set(want) == {"error"}
    try:
        if fn is None:
            raise AttributeError(f"solution.py has no {snake(c['property'])}()")
        got = fn(**{snake(k): v for k, v in c.get("input", {}).items()})
        if isinstance(got, tuple):
            got = list(got)
        ok = not wants_error and got == want
    except Exception as e:  # noqa: BLE001 (any exception counts as the expected error)
        got = {"error": f"{type(e).__name__}: {e}"}
        ok = wants_error
    if not ok:
        failed.append({"case": c["path"], "input": c.get("input"), "expected": want, "got": got})

print(json.dumps({"exercise": data["exercise"], "total": len(cases), "passed": len(cases) - len(failed), "failed": failed[:10]}, ensure_ascii=False))
sys.exit(0 if not failed else 1)
