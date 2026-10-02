"""Save a login once: you sign in by hand in the live view once; the session saves its cookies and local storage into
a saved login when it ends, and later sessions start from it already signed in.

    SIGNIN_URL=https://… CHECK_URL=https://… python python/main.py     (BOXLINE_API_KEY; a plan with saved logins)

CHECK_URL is a page that shows you are signed in (your account page). Writes output/result.json with the saved
login's id: pass it as CONTEXT_ID to the "my-invoices" example, or as `context=` to your own sessions.
"""
import json
import os
from pathlib import Path
from urllib.parse import urlparse

from boxline import Boxline

out = Path(os.environ.get("OUTPUT_DIR", "output"))
signin = os.environ.get("SIGNIN_URL")
if not signin:
    raise SystemExit("Set SIGNIN_URL to your site's sign-in page (and CHECK_URL to a page that shows you are signed in)")
check_url = os.environ.get("CHECK_URL", signin)
name = os.environ.get("LOGIN_NAME", f"{urlparse(signin).netloc} (saved by the example)")
bx = Boxline()

saved = bx.contexts.create(name)
print(f'Saved login {saved["id"]} ("{name}")')

# 1. A session that writes its browser state into the saved login when it ends (persist_context=True). keep_alive: it
#    keeps running while nobody is connected (you, in the live view, come and go). Leaving `with` releases it,
#    which saves the cookies and local storage into the saved login.
with bx.sessions.create(timeout=900, keep_alive=True, context=saved["id"], persist_context=True, user_metadata={"example": "save-a-login"}) as first:
    print(f"Session: {first.id}", flush=True)
    first.goto(signin)
    print(f"\nSign in yourself in the live view (the link works like a password: don't share it):\n  {first.live_url}\n")
    input("Sign in in the live view, then press Enter when you are signed in: ")

# 2. Any later session started from the saved login is signed in already (it does not change the saved login).
with bx.sessions.create(timeout=300, context=saved["id"], user_metadata={"example": "save-a-login"}) as second:
    print(f"Session: {second.id}", flush=True)
    page = second.goto(check_url)
    text = second.content("text")["content"]
    print(f'A new session opened {page["url"]} ("{page["title"]}"): {" ".join(text.split())[:120]}')
    out.mkdir(parents=True, exist_ok=True)
    result = {"contextId": saved["id"], "name": name, "signinUrl": signin, "checkUrl": check_url, "sessions": [first.id, second.id],
              "landedOn": page["url"], "title": page["title"], "text": text[:1000]}
    (out / "result.json").write_text(json.dumps(result, indent=2, ensure_ascii=False))
    print(f'\nSaved login: {saved["id"]} (start sessions with context="{saved["id"]}")')
