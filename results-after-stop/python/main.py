"""Results after stop: a shell session writes a folder of files and stops. The files are then listed, read and downloaded
as one .tar.gz WITHOUT resuming the session: ``files.list``, ``files.read_text`` and ``files.archive`` work on a stopped
session (no machine runs, no machine time is billed). Also shown: a shell-only session has no ``liveUrl``, and a browser
call on it fails with BrowserDisabledError.

    python python/main.py            (BOXLINE_API_KEY; a plan with shell sessions)

Writes output/results.tar.gz and output/result.json.
"""
import json
import os
from pathlib import Path

from boxline import Boxline, BrowserDisabledError

out = Path(os.environ.get("OUTPUT_DIR", "output"))
bx = Boxline()

with bx.sessions.create(browser=False, shell=True, timeout=600, user_metadata={"example": "results-after-stop"}) as session:
    print(f"Session: {session.id}", flush=True)
    # 1. A shell-only session: no browser, so no live view, and a browser call is refused.
    shell_only = {"browser": session.data["browser"], "shell": session.data["shell"], "liveUrl": session.live_url, "connectUrl": session.connect_url}
    refused = None
    try:
        session.goto("https://example.com")
    except BrowserDisabledError as e:
        refused = {"error": type(e).__name__, "code": e.code, "status": e.status}
    if refused is None:
        raise SystemExit("a browser call on a shell-only session should be refused")
    print(f"Shell-only session: liveUrl {shell_only['liveUrl']}; a browser call fails with {refused['error']} ({refused['code']}, status {refused['status']})", flush=True)

    # 2. Several files go into one folder: some written through the API, some by commands in the machine.
    session.files.write("results/summary.txt", "Results of the example results-after-stop\n")
    session.files.write("results/data.csv", "".join(["n,square\n"] + [f"{n},{n * n}\n" for n in range(1, 11)]))
    made = session.exec(
        'mkdir -p results/logs && python3 -c "import json; print(json.dumps([i * i for i in range(1, 11)]))" > results/squares.json && '
        'for i in 1 2 3; do echo "line $i" >> results/logs/run.log; done && echo "outside the folder" > notes.txt',
        cwd="/workspace",
        timeout_ms=60_000,
    )
    if made["exitCode"] != 0:
        raise SystemExit(f"the commands failed: {made['stderr'].strip()}")

    # 3. The session stops: its workspace is saved and the machine is freed.
    session.stop()
    print(f"The session is {session.status}", flush=True)

    # 4. The results, read from the stopped session: no resume.
    listing = session.files.list("results")
    print("results/: " + ", ".join(f"{e['name']} ({e['type']}, {e['size']} bytes)" for e in listing), flush=True)
    summary = session.files.read_text("results/summary.txt")
    squares = session.files.read_text("results/squares.json")
    archive = session.files.archive("results")
    print(f"results.tar.gz: {len(archive)} bytes", flush=True)
    after = bx.sessions.get(session.id).data["status"]
    print(f"After reading and downloading, the session is still {after}", flush=True)

    out.mkdir(parents=True, exist_ok=True)
    (out / "results.tar.gz").write_bytes(archive)
    result = {
        "shellOnly": {**shell_only, "browserCall": refused},
        "stoppedStatus": session.status,
        "listing": [{"name": e["name"], "type": e["type"], "size": e["size"]} for e in listing],
        "read": {"results/summary.txt": summary, "results/squares.json": squares},
        "archive": {"file": "results.tar.gz", "bytes": len(archive)},
        "statusAfterReads": after,
    }
    (out / "result.json").write_text(json.dumps(result, indent=2, ensure_ascii=False))
