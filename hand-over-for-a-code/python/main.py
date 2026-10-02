"""Hand over for a code: the AI signs in with your username and a password kept in the project's secrets, and when
the site asks for a code sent by SMS (or an app), it pauses and asks you for it, then carries on.

    SIGNIN_URL=https://… SITE_USERNAME=… SITE_PASSWORD=… python python/main.py     (BOXLINE_API_KEY)

The password goes into the project secret SIGNIN_PASSWORD (SECRET_NAME picks another name), limited to the sign-in
site; after that SITE_PASSWORD is not needed (set the secret in the console instead, if you like). The run names the
secret, and the model only ever sees %username% and %SIGNIN_PASSWORD%. Writes output/result.json.
"""
import json
import os
from pathlib import Path
from urllib.parse import urlparse

from boxline import Boxline, SecretExistsError

out = Path(os.environ.get("OUTPUT_DIR", "output"))
signin = os.environ.get("SIGNIN_URL")
username = os.environ.get("SITE_USERNAME")
secret_name = os.environ.get("SECRET_NAME", "SIGNIN_PASSWORD")
if not (signin and username):
    raise SystemExit("Set SIGNIN_URL and SITE_USERNAME (and SITE_PASSWORD the first time)")
origin = "{0.scheme}://{0.netloc}".format(urlparse(signin))
bx = Boxline()

# The password as a project secret: stored sealed, never shown again, and typed only into fields on the sign-in site.
secret_created = False
if os.environ.get("SITE_PASSWORD"):
    try:
        bx.secrets.create(secret_name, os.environ["SITE_PASSWORD"], description=f"Password for {urlparse(signin).netloc}", origins=[origin])
        secret_created = True
    except SecretExistsError:
        bx.secrets.update(secret_name, value=os.environ["SITE_PASSWORD"], origins=[origin])
secret = bx.secrets.get(secret_name)
print(f"Project secret {secret_name}: origins {secret['origins']}, scope {secret['scope']}")

run = bx.agent.run(
    f"Open {signin} and sign in with the username %username% and the password %{secret_name}%. When the site asks for a "
    "verification code, ask me for it with ask_user_for_help and wait; then type the code I give you. When I'm signed in, "
    "tell me the name shown on the page.",
    variables={"username": username},
    secrets=[secret_name],  # the model sees %SIGNIN_PASSWORD%; the platform types the value
    max_steps=25,
)
print(f"Agent run {run['id']} ({run['provider']}/{run['model']}) · Session: {run['sessionId']}", flush=True)

handovers = 0
for e in bx.agent.stream(run["id"]):
    if e["type"] == "tool":
        print(f"-> {e['name']} {json.dumps(e.get('input') or {})[:100]}")  # placeholders, never values
    elif e["type"] == "handover" and e.get("by") == "agent":
        handovers += 1
        print(f"\nThe AI asks: {e.get('text')}")
        code = input("Type the code the site sent you: ")
        bx.agent.hand_back(run["id"], f"The verification code is {code.strip()}")
    elif e["type"] == "done":
        print(f"\n{e['status']}: {e.get('result') or e.get('error')}")

done = bx.agent.get(run["id"])
out.mkdir(parents=True, exist_ok=True)
result = {"signinUrl": signin, "secret": secret_name, "agentRuns": [{"id": run["id"]}], "status": done["status"], "answer": done["result"],
          "handovers": handovers, "steps": len(done["steps"]), "model": done["model"], "made": {"secrets": [secret_name] if secret_created else []}}
(out / "result.json").write_text(json.dumps(result, indent=2, ensure_ascii=False))
