"""GitHub profile summary: what a developer works with, measured, not guessed. Their public profile and repository
list are read in a sandboxed browser; their top repositories are cloned in the session's shell and measured there
(lines of code per language, frameworks from the manifests, CI and containers).

    python python/main.py            (BOXLINE_API_KEY; GITHUB_USER, TOP_REPOS; a plan with shell sessions)

Public data only: the profile page, and repositories anyone can clone. Writes output/result.json and output/summary.md.
"""
import json
import os
from pathlib import Path

from boxline import Boxline

here = Path(__file__).resolve().parent
out = Path(os.environ.get("OUTPUT_DIR", "output"))
user = os.environ.get("GITHUB_USER", "octocat")
base = os.environ.get("GITHUB_URL", "https://github.com").rstrip("/")
top_n = int(os.environ.get("TOP_REPOS", "3"))
bx = Boxline()

# 1. The profile and its repositories, sorted by stars (two pages read in one call).
r = bx.extract(
    urls=[f"{base}/{user}", f"{base}/{user}?tab=repositories&type=source&sort=stargazers"],
    prompt=f"The GitHub user {user}: their name, bio, location and followers from the profile, and the repositories listed (name, full https URL, description, main language, stars, whether it is a fork).",
    schema={
        "type": "object",
        "properties": {
            "name": {"type": ["string", "null"]},
            "bio": {"type": ["string", "null"]},
            "location": {"type": ["string", "null"]},
            "followers": {"type": ["integer", "null"]},
            "repos": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {"name": {"type": "string"}, "url": {"type": "string"}, "description": {"type": ["string", "null"]}, "language": {"type": ["string", "null"]}, "stars": {"type": "integer"}, "fork": {"type": "boolean"}},
                    "required": ["name", "url", "description", "language", "stars", "fork"],
                },
            },
        },
        "required": ["name", "bio", "location", "followers", "repos"],
    },
)
profile = r["data"]
# Their own work: forks left out, most stars first; only addresses of this user's repositories are cloned.
own = sorted((x for x in profile["repos"] if not x["fork"] and x["url"].startswith(f"{base}/{user}/")), key=lambda x: -x["stars"])
top = own[:top_n]
print(f"{profile['name'] or user}: {len(profile['repos'])} repositories listed, {len(own)} of their own; measuring {', '.join(x['name'] for x in top)}")
if not top:
    raise SystemExit(f"no public repositories of {user} to measure")

# 2. Clone and measure them on the machine (nothing runs on this computer).
with bx.sessions.create(browser=False, shell=True, timeout=600, idle_timeout=300, user_metadata={"example": "github-profile-summary"}) as session:
    print(f"Session: {session.id}", flush=True)
    session.files.write("stack.py", (here.parent / "stack.py").read_bytes())
    run = session.exec("python stack.py", env={"REPOS": ",".join(x["url"] for x in top)}, timeout_ms=600_000)
    if run["exitCode"] != 0:
        raise SystemExit(f"stack.py failed: {run['stderr'].strip()}")
    print(run["stdout"].strip())
    stack = json.loads(session.files.read_text("stack.json"))

total = sum(stack["linesByLanguage"].values())
languages = [{"language": k, "lines": v, "share": round(v / total * 100, 1) if total else 0} for k, v in stack["linesByLanguage"].items()]
frameworks = sorted({f for x in stack["repos"] for f in x.get("frameworks", [])})
tools = sorted({t for x in stack["repos"] for t in x.get("tools", [])})
repos = [{**t, "measured": next((m for m in stack["repos"] if m["url"] == t["url"]), None)} for t in top]

about = " · ".join(str(v) for v in [profile["bio"], profile["location"], f"{profile['followers']} followers" if profile["followers"] is not None else None] if v)
md = [f"# {profile['name'] or user} ({user})", "", about, "", f"## Languages (lines of code in {len(repos)} top repositories)", ""]
md += [f"- {l['language']}: {l['lines']} lines ({l['share']}%)" for l in languages] or ["- no code files"]
md += ["", f"**Frameworks and libraries:** {', '.join(frameworks) or 'none found in manifests'}", "", f"**Tools:** {', '.join(tools) or 'none found'}", "", "## Repositories", ""]
md += [f"- [{x['name']}]({x['url']}) ({x['stars']} stars): {x['description'] or 'no description'}" + (" (could not be cloned)" if (x["measured"] or {}).get("error") else "") for x in repos] + [""]
md = "\n".join(md)
out.mkdir(parents=True, exist_ok=True)
(out / "summary.md").write_text(md)
result = {"user": user, "profile": {k: v for k, v in profile.items() if k != "repos"}, "listed": len(profile["repos"]), "languages": languages, "frameworks": frameworks, "tools": tools, "repos": repos, "usage": {"modelUsd": r["usage"]["costUsd"]}}
(out / "result.json").write_text(json.dumps(result, indent=2, ensure_ascii=False))
print(f"\n{md}")
