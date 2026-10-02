"""Ask a repository: clone a git repository into a session's shell, then let an agent answer questions about it by
reading the code (ls, grep, cat, git log), not a web page about it. Every answer names the files it rests on.

    python python/main.py            (BOXLINE_API_KEY; REPO_URL, QUESTIONS separated by |; a plan with shell sessions)

The agent works in a session without a browser: only the shell, in the machine. Writes output/result.json and
output/answers.md.
"""
import json
import os
from pathlib import Path

from boxline import Boxline

out = Path(os.environ.get("OUTPUT_DIR", "output"))
repo_url = os.environ.get("REPO_URL", "https://github.com/expressjs/cors.git")
questions = [q.strip() for q in os.environ.get("QUESTIONS", "What does this project do, in two sentences?|How do I use it? Show the smallest example.|How are its tests run, and with which test framework?").split("|") if q.strip()]
bx = Boxline()

OUTPUT = {
    "type": "object",
    "properties": {
        "answers": {
            "type": "array",
            "items": {"type": "object", "properties": {"question": {"type": "string"}, "answer": {"type": "string"}, "files": {"type": "array", "items": {"type": "string"}}}, "required": ["question", "answer", "files"]},
        }
    },
    "required": ["answers"],
}

with bx.sessions.create(browser=False, shell=True, timeout=900, idle_timeout=300, user_metadata={"example": "ask-a-repo"}) as session:
    print(f"Session: {session.id}", flush=True)
    # 1. The repository goes into the machine (the address as a variable, not inside the command); shallow when the
    #    server can (a "dumb" HTTP git server cannot, then all of it).
    clone = session.exec('(git clone --depth 1 --quiet "$REPO_URL" repo 2>/dev/null || git clone --quiet "$REPO_URL" repo) && git -C repo log -1 --format="%h %s" && find repo -type f -not -path "*/.git/*" | wc -l', env={"REPO_URL": repo_url}, timeout_ms=180_000)
    if clone["exitCode"] != 0:
        raise SystemExit(f"git clone failed: {clone['stderr'].strip()}")
    head, count = (clone["stdout"].strip().split("\n") + [""])[:2]
    print(f"Cloned {repo_url} at {head} ({count.strip()} files)")

    # 2. An agent answers from the code, in the same session (its shell; there is no browser).
    numbered = "\n".join(f"{i}. {q}" for i, q in enumerate(questions, 1))
    started = bx.agent.run(
        "The git repository is checked out in /workspace/repo. Answer these questions from its files only (use the shell: ls, "
        "grep, cat, git log). Do not change anything. For each answer list the repository files it rests on, as paths "
        f"relative to the repository root.\n\n{numbered}",
        session_id=session.id,
        max_steps=25,
        output=OUTPUT,
    )
    print(f"Agent run {started['id']} ({started['model']}) is reading the code…", flush=True)
    run = bx.agent.wait(started["id"])
    if run["status"] != "completed" or not run["result"]:
        raise SystemExit(f"the run {run['status']}: {run.get('error') or 'no answer'}")
    answers = run["result"]["answers"]

    # 3. Every file an answer names must exist in the checkout (the paths go in as a file, never into the command).
    files = sorted({f for a in answers for f in a["files"]})
    missing = []
    if files:
        session.files.write("cited.txt", "\n".join(files) + "\n")
        listed = session.exec('cd repo && while IFS= read -r f; do [ -f "$f" ] || echo "$f"; done < ../cited.txt', timeout_ms=30_000)
        missing = [line for line in listed["stdout"].split("\n") if line]

    tool_steps = [s for s in run["steps"] if s["type"] == "tool"]
    for a in answers:
        print(f"\nQ: {a['question']}\nA: {a['answer']}\n   ({', '.join(a['files']) or 'no files named'})")
    print(f"\n{len(tool_steps)} tool steps, ${(run.get('usage') or {}).get('costUsd', 0):.4f} of model use" + (f"; files named but not in the repo: {', '.join(missing)}" if missing else "; every file named exists"))

    md = [f"# {repo_url}", "", f"At {head}.", ""]
    for a in answers:
        md += [f"## {a['question']}", "", a["answer"], "", "Files: " + (", ".join(f"`{f}`" for f in a["files"]) or "none"), ""]
    out.mkdir(parents=True, exist_ok=True)
    (out / "answers.md").write_text("\n".join(md))
    result = {"repoUrl": repo_url, "head": head, "questions": questions, "answers": answers, "missingFiles": missing, "toolSteps": [{"name": s.get("name"), "input": s.get("input")} for s in tool_steps], "agentRuns": [{"id": run["id"]}]}
    (out / "result.json").write_text(json.dumps(result, indent=2, ensure_ascii=False))
