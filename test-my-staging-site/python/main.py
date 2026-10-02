"""Test my staging site: clone your repository in the session's shell, run its tests against your staging site, and
open every page that failed in the session's browser for a screenshot.

    REPO_URL=… STAGING_URL=… python python/main.py     (BOXLINE_API_KEY; TEST_COMMAND, default "npm test")

The tests get STAGING_URL in their environment. Pages that failed are the staging addresses the test output names.
Writes output/result.json and output/failures/N.png.
"""
import json
import os
import re
from pathlib import Path

from boxline import Boxline

out = Path(os.environ.get("OUTPUT_DIR", "output"))
repo = os.environ.get("REPO_URL")
staging = os.environ.get("STAGING_URL")
test_command = os.environ.get("TEST_COMMAND", "npm test")
if not repo or not staging:
    raise SystemExit("Set REPO_URL (a repository you may clone) and STAGING_URL (the site its tests should check)")
bx = Boxline()


def shown(url: str) -> str:
    return re.sub(r"//[^/@]*@", "//", url)  # never print a token that is part of the address


with bx.sessions.create(shell=True, timeout=900, user_metadata={"example": "test-my-staging-site"}) as session:
    print(f"Session: {session.id}", flush=True)
    # 1. The shell: clone, install, test. Addresses go in as environment variables, never into the command text.
    env = {"REPO_URL": repo, "STAGING_URL": staging}
    # A shallow clone where the server offers it (plain-HTTP servers do not), else a full one.
    clone = session.exec('rm -rf app && { git clone --quiet --depth 1 "$REPO_URL" app 2>/dev/null || git clone --quiet "$REPO_URL" app; }', env=env, timeout_ms=180_000)
    if clone["exitCode"] != 0:
        raise SystemExit(f"git clone failed: {clone['stderr'].strip()}")
    print(f"Cloned {shown(repo)}")
    install = session.exec("[ -f package.json ] && npm install --no-audit --no-fund --silent || true", cwd="app", timeout_ms=600_000)
    if install["exitCode"] != 0:
        print(f"npm install: {install['stderr'].strip()}")
    print(f'Running "{test_command}" against {staging}')
    tests = session.exec(test_command, cwd="app", env=env, timeout_ms=600_000)
    output = f"{tests['stdout']}\n{tests['stderr']}"

    def count(what: str):
        m = re.search(rf"^\s*(?:#|ℹ)\s*{what}\s+(\d+)", output, re.M)
        return int(m.group(1)) if m else None

    state = "passed" if tests["exitCode"] == 0 else f"failed (exit {tests['exitCode']})"
    print(f"Tests {state}: {count('pass')} passed, {count('fail')} failed")

    # 2. The browser: open each staging page the failures name, and screenshot it.
    urls = list(dict.fromkeys(m.group(0).rstrip(".,:;") for m in re.finditer(re.escape(staging) + r"""[^\s"'<>)\]]*""", output)))
    (out / "failures").mkdir(parents=True, exist_ok=True)
    failures = []
    for i, url in enumerate(urls, start=1):
        page = session.goto(url)
        file = f"failures/{i}.png"
        (out / file).write_bytes(session.screenshot())
        failures.append({"url": url, "status": page["status"], "title": page["title"], "screenshot": file})
        print(f'  failed: {url} (HTTP {page["status"]}, "{page["title"]}") -> output/{file}')

    result = {"repo": shown(repo), "staging": staging, "command": test_command, "exitCode": tests["exitCode"], "passed": count("pass"),
              "failed": count("fail"), "failures": failures, "outputTail": output.strip()[-3000:]}
    (out / "result.json").write_text(json.dumps(result, indent=2, ensure_ascii=False))
