"""Changelog between refs: clone a repository into a session's shell, list the commits between two tags (or any two
refs), and let an agent in that session write the changelog from the history itself (git log, git show), grouped
for readers, every line citing its commits. The code checks that each cited commit is in the range.

    python python/main.py            (BOXLINE_API_KEY; REPO_URL, FROM, TO; a plan with shell sessions)

Writes output/CHANGELOG.md and output/result.json.
"""
import json
import os
from pathlib import Path

from boxline import Boxline

out = Path(os.environ.get("OUTPUT_DIR", "output"))
env = {"REPO_URL": os.environ.get("REPO_URL", "https://github.com/expressjs/cors.git"), "FROM": os.environ.get("FROM", "v2.8.4"), "TO": os.environ.get("TO", "v2.8.5")}
bx = Boxline()

OUTPUT = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
        "sections": {"type": "array", "items": {"type": "object", "properties": {"title": {"type": "string"}, "items": {"type": "array", "items": {"type": "object", "properties": {"text": {"type": "string"}, "commits": {"type": "array", "items": {"type": "string"}}}, "required": ["text", "commits"]}}}, "required": ["title", "items"]}},
    },
    "required": ["summary", "sections"],
}

with bx.sessions.create(browser=False, shell=True, timeout=900, idle_timeout=300, user_metadata={"example": "changelog-between-refs"}) as session:
    print(f"Session: {session.id}", flush=True)
    # 1. The repository and the commits in the range (the refs as variables, never pasted into the command).
    r = session.exec(
        'git clone --quiet "$REPO_URL" repo && cd repo && git log --no-merges --format="%h%x09%ad%x09%s" --date=short "$FROM..$TO" && echo "---" && git diff --shortstat "$FROM" "$TO"',
        env=env,
        timeout_ms=300_000,
    )
    if r["exitCode"] != 0:
        raise SystemExit(f"git failed: {r['stderr'].strip()}")
    commits, _, stat = r["stdout"].partition("\n---\n")
    log = [dict(zip(("sha", "date", "subject"), line.split("\t"))) for line in commits.split("\n") if line]
    print(f"{env['REPO_URL']} {env['FROM']}..{env['TO']}: {len(log)} commits, {stat.strip()}")
    if not log:
        raise SystemExit(f"no commits between {env['FROM']} and {env['TO']}")

    # 2. The changelog, written by an agent that reads the history in the shell (no browser in this session).
    started = bx.agent.run(
        f"The repository is cloned in /workspace/repo. Write the changelog for the changes from {env['FROM']} to {env['TO']} (git log {env['FROM']}..{env['TO']}; "
        "use git show to understand a commit when its subject is unclear). For users of the project: group into sections such as Added, Fixed, Changed, "
        "Documentation; leave out what does not affect them (dependency bumps, chores, CI) unless it matters. Each item: one plain sentence, and the "
        "short hashes of its commits. summary: one sentence on what the release brings. Do not change the repository and do not write files: answer only in your output.",
        session_id=session.id,
        max_steps=20,
        output=OUTPUT,
    )
    print(f"Agent run {started['id']} ({started['model']}) is reading the history…", flush=True)
    run = bx.agent.wait(started["id"])
    if run["status"] != "completed" or not run["result"]:
        raise SystemExit(f"the run {run['status']}: {run.get('error') or 'no answer'}")
    changelog = run["result"]


# 3. An item without commits is not part of the release notes (it is kept apart); every cited commit must be one of
#    the range's (a short hash may be longer or shorter than git's).
uncited = [i["text"] for s in changelog["sections"] for i in s["items"] if not i["commits"]]
changelog["sections"] = [{**s, "items": [i for i in s["items"] if i["commits"]]} for s in changelog["sections"]]
changelog["sections"] = [s for s in changelog["sections"] if s["items"]]


def match(c):
    return next((l["sha"] for l in log if l["sha"].startswith(c[:7]) or c.startswith(l["sha"])), None)


unknown = [c for s in changelog["sections"] for i in s["items"] for c in i["commits"] if not match(c)]
cited = sorted({match(c) for s in changelog["sections"] for i in s["items"] for c in i["commits"] if match(c)})
md = [f"## {env['TO']}", "", changelog["summary"], ""]
for s in changelog["sections"]:
    md += [f"### {s['title']}", ""] + [f"- {i['text']} ({', '.join(i['commits'])})" for i in s["items"]] + [""]
md = "\n".join(md)
print(f"\n{md}")
print(f"{len(cited)} of {len(log)} commits cited" + (f"; not in the range: {', '.join(unknown)}" if unknown else "; every cited commit is in the range") + (f"; left out (no commits): {' | '.join(uncited)}" if uncited else ""))
out.mkdir(parents=True, exist_ok=True)
(out / "CHANGELOG.md").write_text(md)
(out / "result.json").write_text(json.dumps({**env, "commits": log, "changelog": changelog, "cited": cited, "unknownCommits": unknown, "uncited": uncited, "agentRuns": [{"id": run["id"]}]}, indent=2, ensure_ascii=False))
