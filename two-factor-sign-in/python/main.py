"""Two-factor sign-in: keep a site's sign-in details as a password credential once (user name, password and the 2FA
setup key) and link it to a profile, then an agent run signs in with %NAME.username%, %NAME.password% and %NAME.otp%:
the platform makes the current 6-digit code at the moment it is typed. The model never sees any of them, and they are
typed only on that site.

    SIGNIN_URL=https://… SITE_USERNAME=… SITE_PASSWORD=… SITE_TOTP_SECRET=… python python/main.py   (BOXLINE_API_KEY)

SITE_TOTP_SECRET is the "setup key" the site shows when you turn on an authenticator app (or its otpauth:// link).
CREDENTIAL_NAME picks the credential's name (default TWO_FACTOR_EXAMPLE). With PROFILE_ID of a profile that already
links a password credential, the three are not needed. Needs a plan with password credentials (loginDetails). Writes
output/result.json.
"""
import json
import os
from pathlib import Path
from urllib.parse import urlparse

from boxline import Boxline, CredentialExistsError

out = Path(os.environ.get("OUTPUT_DIR", "output"))
signin = os.environ.get("SIGNIN_URL")
if not signin:
    raise SystemExit("Set SIGNIN_URL to the site's sign-in page")
u = urlparse(signin)
credential_name = os.environ.get("CREDENTIAL_NAME", "TWO_FACTOR_EXAMPLE")
bx = Boxline()

# 1. The password credential, linked to a profile (sealed on the platform; only whether they are there is ever shown again).
profile_id = os.environ.get("PROFILE_ID")
made = False
credential_made = False
if not profile_id:
    profile_id = bx.profiles.create(f"{u.netloc} (two-factor example)")["id"]
    made = True
if os.environ.get("SITE_PASSWORD"):
    username, totp_secret = os.environ.get("SITE_USERNAME"), os.environ.get("SITE_TOTP_SECRET")
    if not username or not totp_secret:
        raise SystemExit("Set SITE_USERNAME and SITE_TOTP_SECRET with SITE_PASSWORD")
    origins = [f"{u.scheme}://{u.netloc}"]
    try:
        bx.credentials.create(credential_name, "password", origins=origins, username=username, password=os.environ["SITE_PASSWORD"], totp_secret=totp_secret)
        credential_made = True
    except CredentialExistsError:
        bx.credentials.update(credential_name, origins=origins, username=username, password=os.environ["SITE_PASSWORD"], totp_secret=totp_secret)
    bx.profiles.update(profile_id, credential=credential_name)
saved = bx.profiles.get(profile_id)
credential = bx.credentials.get(saved["credential"]) if saved.get("credential") else None
if not credential or credential["type"] != "password":
    raise SystemExit(f"profile {profile_id} links no password credential: set SITE_USERNAME, SITE_PASSWORD and SITE_TOTP_SECRET")
name = credential["name"]
print(f"Browser profile {profile_id} signs in with {name}: {credential['username']} on {', '.join(credential['origins'])}, 2FA {'on' if credential['hasTotp'] else 'off'}")

# 2. An agent run in a session started from the profile: the profile's credential is added for you, and the AI types
# its parts where the site asks for them.
run = bx.agent.run(
    f"Open {signin} and sign in: type %{name}.username% as the email or user name and %{name}.password% as the password. "
    f"When the site asks for a verification code from an authenticator app, type %{name}.otp%. Then tell me the name shown on the page.",
    session={"profile": {"id": profile_id}},
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
result = {"signinUrl": signin, "profileId": profile_id,
          "credential": {"name": name, "username": credential["username"], "origins": credential["origins"], "hasTotp": credential["hasTotp"]},
          "agentRuns": [{"id": run["id"]}], "status": done["status"], "answer": done["result"], "steps": len(done["steps"]),
          "made": {"profiles": [profile_id] if made else [], "credentials": [credential_name] if credential_made else []}}
(out / "result.json").write_text(json.dumps(result, indent=2, ensure_ascii=False))
