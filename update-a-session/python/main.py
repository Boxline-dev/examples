"""Update a session: a running session gets a longer life and fresh URLs in one call, ``session.update(timeout=..., rotate_urls=True)``.
The example shows that ``expiresAt`` moved by the extra time, and that the old connect and live URLs stopped working while
the new ones work.

    python python/main.py            (BOXLINE_API_KEY; a plan whose longest session is 10 minutes or more)

Writes output/result.json.
"""
import json
import os
import time
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path
from typing import Callable, Tuple

from playwright.sync_api import sync_playwright

from boxline import Boxline

out = Path(os.environ.get("OUTPUT_DIR", "output"))
bx = Boxline()


def seconds(iso: str) -> float:
    return datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp()


def status_of(url: str) -> int:
    try:
        with urllib.request.urlopen(url, timeout=20) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code


def connects(p, url: str, timeout: int) -> dict:
    """Connects Playwright to a connect URL: ``{"ok": True, "pages": n}`` or ``{"ok": False, "error": ...}``."""
    try:
        browser = p.chromium.connect_over_cdp(url, timeout=timeout)
        pages = len(browser.contexts[0].pages) if browser.contexts else 0
        browser.close()
        return {"ok": True, "pages": pages}
    except Exception as e:  # Playwright's own error type
        return {"ok": False, "error": str(e).split("\n")[0][:160]}


def until(attempt: Callable[[], object], done: Callable[[object], bool]) -> Tuple[object, int]:
    """Tries until an old URL is refused: another API server may take a few seconds to forget it (at most 20 s)."""
    deadline = time.monotonic() + 20
    attempts = 0
    while True:
        attempts += 1
        value = attempt()
        if done(value) or time.monotonic() > deadline:
            return value, attempts
        time.sleep(2)


# keep_alive: the example connects Playwright and disconnects again; without it a browser-only session stops 5 s after its last client leaves.
with bx.sessions.create(timeout=300, keep_alive=True, user_metadata={"example": "update-a-session"}) as session, sync_playwright() as p:
    print(f"Session: {session.id}", flush=True)
    before = {"expiresAt": session.data["expiresAt"], "timeout": session.data["timeout"], "connectUrl": session.connect_url, "liveUrl": session.live_url}
    before_connect = connects(p, before["connectUrl"], 20_000)
    print(f"Before: the session lasts {before['timeout']} s, until {before['expiresAt']}; its connect URL {'works' if before_connect['ok'] else 'does not work'}", flush=True)

    # One call: a longer life and fresh URLs. The session keeps running; nothing else about it changes.
    session.update(timeout=600, rotate_urls=True)
    added = seconds(session.data["expiresAt"]) - seconds(before["expiresAt"])
    print(f"After: the session lasts {session.data['timeout']} s, until {session.data['expiresAt']} ({added:g} s later)", flush=True)

    # The old URLs stop working; the new ones work.
    old_live, old_live_tries = until(lambda: status_of(before["liveUrl"]), lambda status: status == 401)
    new_live = status_of(session.live_url)
    old_connect, old_connect_tries = until(lambda: connects(p, before["connectUrl"], 8000), lambda r: not r["ok"])
    new_connect = connects(p, session.connect_url, 20_000)
    print(f"Old live URL: {old_live} (after {old_live_tries} tries); new live URL: {new_live}", flush=True)
    print(f"Old connect URL: {'still works' if old_connect['ok'] else 'refused (' + old_connect['error'] + ')'}; new connect URL: {'works' if new_connect['ok'] else 'does not work'}", flush=True)

    out.mkdir(parents=True, exist_ok=True)
    result = {
        "before": {"timeout": before["timeout"], "expiresAt": before["expiresAt"], "connectWorked": before_connect["ok"]},
        "after": {"timeout": session.data["timeout"], "expiresAt": session.data["expiresAt"]},
        "addedSeconds": added,
        "urlsChanged": {"connectUrl": session.connect_url != before["connectUrl"], "liveUrl": session.live_url != before["liveUrl"]},
        "oldLive": {"status": old_live, "tries": old_live_tries},
        "newLive": {"status": new_live},
        "oldConnect": {"refused": not old_connect["ok"], "error": None if old_connect["ok"] else old_connect["error"], "tries": old_connect_tries},
        "newConnect": {"connected": new_connect["ok"]},
    }
    (out / "result.json").write_text(json.dumps(result, indent=2, ensure_ascii=False))
