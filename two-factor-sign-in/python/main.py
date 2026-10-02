"""Two-factor sign-in: keep a site's sign-in details on a saved login once (user name, password and the 2FA setup key),
then an agent run signs in with %login.username%, %login.password% and %login.otp%: the platform makes the current
6-digit code at the moment it is typed. The model never sees any of them, and they are typed only on that site.

    SIGNIN_URL=https://… SITE_USERNAME=… SITE_PASSWORD=… SITE_TOTP_SECRET=… python python/main.py   (BOXLINE_API_KEY)

SITE_TOTP_SECRET is the "setup key" the site shows when you turn on an authenticator app (or its otpauth:// link).
With CONTEXT_ID of a saved login that already has details, the three are not needed. Needs a plan with saved login
details (loginDetails). Writes output/result.json.
"""
import json
import os
from pathlib import Path
from urllib.parse import urlparse

from boxline import Boxline

out = Path(os.environ.get("OUTPUT_DIR", "output"))
signin = os.environ.get("SIGNIN_URL")
if not signin:
    raise SystemExit("Set SIGNIN_URL to the site's sign-in page")
u = urlparse(signin)
bx = Boxline()

# 1. The saved login and its details (sealed on the platform; only whether they are there is ever shown again).
context_id = os.environ.get("CONTEXT_ID")
made = False
if not context_id:
    context_id = bx.contexts.create(f"{u.netloc} (two-factor example)")["id"]
    made = True
if os.environ.get("SITE_PASSWORD"):
    username, totp_secret = os.environ.get("SITE_USERNAME"), os.environ.get("SITE_TOTP_SECRET")
    if not username or not totp_secret:
        raise SystemExit("Set SITE_USERNAME and SITE_TOTP_SECRET with SITE_PASSWORD")
    bx.contexts.set_login(context_id, f"{u.scheme}://{u.netloc}", username, os.environ["SITE_PASSWORD"], totp_secret)
saved = bx.contexts.get(context_id)
login = saved.get("login")
if not login or not login["hasPassword"]:
    raise SystemExit(f"saved login {context_id} has no sign-in details: set SITE_USERNAME, SITE_PASSWORD and SITE_TOTP_SECRET")
print(f"Saved login {context_id}: {login['username']} on {login['origin']}, 2FA {'on' if login['hasTotp'] else 'off'}")

# 2. An agent run in a session started from the saved login: it types the details where the site asks for them.
run = bx.agent.run(
    f"Open {signin} and sign in: type %login.username% as the email or user name and %login.password% as the password. "
    "When the site asks for a verification code from an authenticator app, type %login.otp%. Then tell me the name shown on the page.",
    context={"id": context_id},
    max_steps=20,
)
print(f"Agent run {run['id']} ({run['provider']}/{run['model']}) · Session: {run['sessionId']}", flush=True)
for e in bx.agent.stream(run["id"]):
    if e["type"] == "tool":
        print(f"-> {e['name']} {json.dumps(e.get('input') or {})[:100]}")  # placeholders only
    elif e["type"] == "done":
        print(f"\n{e['status']}: {e.get('result') or e.get('error')}")

done = bx.agent.get(run["id"])
out.mkdir(parents=True, exist_ok=True)
result = {"signinUrl": signin, "contextId": context_id, "login": login, "agentRuns": [{"id": run["id"]}], "status": done["status"],
          "answer": done["result"], "steps": len(done["steps"]), "made": {"contexts": [context_id] if made else []}}
(out / "result.json").write_text(json.dumps(result, indent=2, ensure_ascii=False))
