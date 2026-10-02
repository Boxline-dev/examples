"""Compare models: a small benchmark. The same browser tasks, each with its right answer written down beforehand
(tasks.json), are run by two or more models side by side; the example scores every run itself (no model judges) and
prints each model's pass rate, time, steps and cost.

    python python/main.py            (BOXLINE_API_KEY; MODELS, TRIALS, TASKS_FILE)

A run that did not pass is sorted, never guessed: model_failure (a wrong answer, no answer, a step, cost or time
limit), web_failure (it ended on a bot wall or CAPTCHA page), platform_failure (its session or the server failed) or
unclassified. Writes output/result.json, output/runs.jsonl (one line per run, with its steps) and output/summary.md.
"""
import json
import os
import re
import statistics
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from boxline import Boxline, BoxlineTimeoutError

here = Path(__file__).resolve().parent
out = Path(os.environ.get("OUTPUT_DIR", "output"))
tasks_file = os.environ.get("TASKS_FILE", str(here.parent / "tasks.json"))
trials = int(os.environ.get("TRIALS", "1"))
time_limit_s = 3 * 60  # per run
bx = Boxline()
tasks = json.loads(Path(tasks_file).read_text())["tasks"]

catalog = bx.agent.models()
available = [{"provider": p["id"], **m} for p in catalog["providers"] if p["available"] for m in p["models"]]
wanted = [s.strip() for s in os.environ.get("MODELS", "").split(",") if s.strip()]
if wanted:
    models = []
    for model_id in wanted:
        match = next((m for m in available if m["id"] == model_id), None)
        if not match:
            raise SystemExit(f"{model_id} is not a configured model")
        models.append(match)
else:
    same = [m for m in available if m["provider"] == catalog["default"]["provider"]]
    first = next((m for m in same if m["id"] == catalog["default"]["model"]), same[0])
    others = sorted((m for m in same if m["id"] != first["id"]), key=lambda m: m["pricePerMTok"]["input"])
    models = [first, others[0] if others else first]

# Pages that are a wall in front of the site: the run failed on the web, not because of the model.
WALL = ["captcha", "verify you are human", "are you a robot", "unusual traffic", "access denied", "attention required", "just a moment", "enable javascript and cookies to continue"]
MODEL_LIMITS = {"max_steps", "max_cost", "too_many_errors", "no_progress", "output_invalid"}
PLATFORM = {"server_restarted", "session_timeout", "session_ended", "internal"}


def bare(u: str) -> str:
    return re.sub(r"[#?].*$", "", u).rstrip("/")


def unmet_condition(c: dict, answer: str, visited: list) -> bool:
    if "answerContains" in c:
        return c["answerContains"].lower() not in answer.lower()
    if "answerMatches" in c:
        return not re.search(c["answerMatches"], answer, re.I)
    return bare(c.get("urlReached", "")) not in visited


def score(task: dict, run: dict, timed_out: bool) -> dict:
    answer = str(run["result"] or "") if run["status"] == "completed" else ""
    text = json.dumps([[s.get("input"), s.get("output")] for s in run["steps"]])
    visited = list(dict.fromkeys(bare(u) for u in re.findall(r"https?://[^\s\"'\\)]+", text)))
    unmet = [c for c in task["pass"] if unmet_condition(c, answer, visited)]
    if run["status"] == "completed" and not unmet:
        return {"outcome": "pass", "detail": None, "visited": visited}
    last_pages = "\n".join(str(s.get("output") or "") for s in [s for s in run["steps"] if s["type"] == "tool"][-3:]).lower()
    if any(m in last_pages for m in WALL):
        return {"outcome": "web_failure", "detail": "it ended on a bot wall or CAPTCHA page", "visited": visited}
    if timed_out:
        return {"outcome": "model_failure", "detail": f"not done in {time_limit_s // 60} minutes", "visited": visited}
    if run["status"] == "completed":
        detail = f"wrong answer (unmet: {', '.join(json.dumps(c) for c in unmet)})" if answer else "no answer"
        return {"outcome": "model_failure", "detail": detail, "visited": visited}
    code = run.get("errorCode") or ""
    if code in MODEL_LIMITS:
        return {"outcome": "model_failure", "detail": f"{code}: {run.get('error')}", "visited": visited}
    if code in PLATFORM:
        return {"outcome": "platform_failure", "detail": f"{code}: {run.get('error')}", "visited": visited}
    return {"outcome": "unclassified", "detail": f"{run['status']} {code}: {run.get('error') or ''}".strip(), "visited": visited}


def trial(task: dict, m: dict, n: int) -> dict:
    t0 = time.monotonic()
    started = bx.agent.run(f"Start at {task['startUrl']}. {task['instruction']} Give the answer in your final message.", provider=m["provider"], model=m["id"], max_steps=20)
    print(f"  {m['id']}: run {started['id']} · Session: {started['sessionId']}", flush=True)
    timed_out = False
    try:
        run = bx.agent.wait(started["id"], timeout=time_limit_s)
    except BoxlineTimeoutError:
        timed_out = True
        try:
            bx.agent.cancel(started["id"])
        except Exception:
            pass
        run = bx.agent.wait(started["id"], timeout=60)
    s = score(task, run, timed_out)
    tools = [x for x in run["steps"] if x["type"] == "tool"]
    return {
        "task": task["id"],
        "trial": n,
        "model": m["id"],
        "provider": m["provider"],
        "runId": run["id"],
        "status": run["status"],
        "pass": s["outcome"] == "pass",
        "outcome": s["outcome"],
        "detail": s["detail"],
        "seconds": round(time.monotonic() - t0, 1),
        "toolSteps": len(tools),
        "inputTokens": run["usage"]["inputTokens"],
        "outputTokens": run["usage"]["outputTokens"],
        "costUsd": run["usage"]["costUsd"],
        "answer": run["result"] if run["status"] == "completed" else run.get("error"),
        "visited": s["visited"],
        "steps": [{"name": x.get("name"), "input": x.get("input"), "ms": x.get("ms"), "isError": x.get("isError", False)} for x in tools],
    }


out.mkdir(parents=True, exist_ok=True)
runs_file = out / "runs.jsonl"
runs_file.write_text("")
rows = []
# Task by task, the models side by side: each task's runs see the same web at the same time.
with ThreadPoolExecutor(len(models)) as pool:
    for task in tasks:
        for n in range(1, trials + 1):
            print(f"{task['id']}{f' (trial {n})' if trials > 1 else ''}", flush=True)
            for row in pool.map(lambda m: trial(task, m, n), models):
                rows.append(row)
                detail = f" ({row['detail']})" if row["detail"] else ""
                with runs_file.open("a") as f:
                    f.write(json.dumps(row, ensure_ascii=False) + "\n")
                print(f"    {row['model']}: {row['outcome']}{detail}, {row['seconds']} s, {row['toolSteps']} steps, ${row['costUsd']:.4f}", flush=True)

summary = []
for m in models:
    mine = [r for r in rows if r["model"] == m["id"]]
    outcomes: dict = {}
    for r in mine:
        outcomes[r["outcome"]] = outcomes.get(r["outcome"], 0) + 1
    summary.append({
        "model": m["id"],
        "provider": m["provider"],
        "passed": sum(r["pass"] for r in mine),
        "runs": len(mine),
        "medianSeconds": statistics.median(r["seconds"] for r in mine),
        "medianSteps": statistics.median(r["toolSteps"] for r in mine),
        "costUsd": round(sum(r["costUsd"] for r in mine), 4),
        "outcomes": outcomes,
    })
print(f"\n{'model':<20} {'passed':>7} {'median s':>9} {'steps':>6} {'cost':>9}")
for s in summary:
    print(f"{s['model']:<20} {str(s['passed']) + '/' + str(s['runs']):>7} {s['medianSeconds']:>9} {s['medianSteps']:>6} {'$%.4f' % s['costUsd']:>9}")
md = [
    f"# {len(tasks)} tasks × {len(models)} models × {trials} trial{'s' if trials > 1 else ''}",
    "",
    "| Model | Passed | Median time | Median steps | Cost | Outcomes |",
    "|---|---|---|---|---|---|",
    *(f"| {s['model']} | {s['passed']}/{s['runs']} | {s['medianSeconds']} s | {s['medianSteps']} | ${s['costUsd']:.4f} | {', '.join(f'{k} {v}' for k, v in s['outcomes'].items())} |" for s in summary),
    "",
    "| Task | " + " | ".join(m["id"] for m in models) + " |",
    "|---|" + "---|" * len(models),
    *(f"| {t['id']} | " + " | ".join(", ".join("pass" if r["pass"] else r["outcome"] for r in rows if r["task"] == t["id"] and r["model"] == m["id"]) for m in models) + " |" for t in tasks),
]
(out / "summary.md").write_text("\n".join(md) + "\n")
result = {"tasksFile": tasks_file, "tasks": tasks, "models": [{"id": m["id"], "provider": m["provider"]} for m in models], "trials": trials, "summary": summary,
          "rows": [{k: v for k, v in r.items() if k != "steps"} for r in rows], "agentRuns": [{"id": r["runId"]} for r in rows]}
(out / "result.json").write_text(json.dumps(result, indent=2, ensure_ascii=False))
