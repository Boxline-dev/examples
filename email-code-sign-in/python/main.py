"""Email-code sign-in: a site that emails a one-time code after the password. The password is a credential with
``code_source="push"``: an agent run signs in with %NAME.username%, %NAME.password% and %NAME.otp%, and when it reaches
the code field it waits. You hear of it (a ``code`` step in the run, and the webhook ``credential.code_needed``), read
the email, and send the code with ``credentials.push_code``. The model never sees the password or the code: the
platform types them, only on that site.

    SIGNIN_URL=https://… SITE_USERNAME=… SITE_PASSWORD=… MAILBOX_URL=https://… python python/main.py   (BOXLINE_API_KEY)

MAILBOX_URL is where YOUR system reads the site's email: an address that answers ``{"messages": [{"text": "...",
"receivedAt": "<iso time>"}]}``, newest first (here it is the stand-in site's mailbox, like a mail provider's API). With a
real site, change read_code() to read your own mailbox. CREDENTIAL_NAME picks the credential's name (default
EMAIL_CODE_EXAMPLE). Needs a plan with password credentials (loginDetails). Writes output/result.json.
"""
import json
import os
import re
import time
import urllib.request
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse

from boxline import Boxline, CredentialExistsError

out = Path(os.environ.get("OUTPUT_DIR", "output"))
signin, username, password, mailbox = (os.environ.get(k) for k in ("SIGNIN_URL", "SITE_USERNAME", "SITE_PASSWORD", "MAILBOX_URL"))
if not (signin and username and password and mailbox):
    raise SystemExit("Set SIGNIN_URL, SITE_USERNAME, SITE_PASSWORD and MAILBOX_URL")
name = os.environ.get("CREDENTIAL_NAME", "EMAIL_CODE_EXAMPLE")
bx = Boxline()


def read_code(since: float) -> str:
    """The newest 6-digit code in a message that arrived after `since` (seconds): the one function to change for your mailbox."""
    for _ in range(60):
        with urllib.request.urlopen(mailbox, timeout=10) as r:
            messages = json.load(r)["messages"]
        for m in messages:
            if datetime.fromisoformat(m["receivedAt"].replace("Z", "+00:00")).timestamp() >= since:
                found = re.search(r"\b(\d{6})\b", m["text"])
                if found:
                    return found.group(1)
        time.sleep(1)
    raise SystemExit("no email with a code arrived in the mailbox")


# 1. The password as a credential whose codes you send yourself (sealed on the platform; never shown again).
u = urlparse(signin)
fields = {"origins": [f"{u.scheme}://{u.netloc}"], "username": username, "password": password, "code_source": "push", "code_timeout_seconds": 120}
credential_made = False
try:
    bx.credentials.create(name, "password", **fields)
    credential_made = True
except CredentialExistsError:
    bx.credentials.update(name, **fields)

result = None
try:
    with bx.sessions.create(timeout=600, idle_timeout=300, user_metadata={"example": "email-code-sign-in"}) as session:
        print(f"Session: {session.id}", flush=True)
        # 2. The run signs in. At the code field it types %NAME.otp%, and the platform waits for a code that you send.
        started = time.time() - 2
        run = bx.agent.run(
            f"Open {signin} and sign in: type %{name}.username% as the email and %{name}.password% as the password, then press Next. "
            f"The site emails a sign-in code: type %{name}.otp% into the code field and press Verify. Then tell me the name shown on the page.",
            session_id=session.id,
            credentials=[name],
            max_steps=25,
        )
        print(f"Agent run {run['id']} ({run['provider']}/{run['model']})", flush=True)

        # 3. When the run waits for the code, read the email and send the code. It is used once, by this wait, and the
        # run never holds it.
        pushed_at = None
        for e in bx.agent.stream(run["id"]):
            if e["type"] == "tool":
                print(f"-> {e['name']} {json.dumps(e.get('input') or {})[:100]}")  # placeholders only
            elif e["type"] == "code" and e.get("state") == "waiting":
                print(f"The run waits for the {e.get('kind')} the site emailed for {e.get('credential')}: reading the mailbox…", flush=True)
                code = read_code(started)
                pushed_at = int(time.time() * 1000)
                bx.credentials.push_code(name, code=code)
                print(f"Sent the {len(code)}-digit code to {name}", flush=True)
            elif e["type"] == "done":
                print(f"\n{e['status']}: {e.get('result') or e.get('error')}")

        done = bx.agent.get(run["id"])
        audit = [{"action": x["action"], **({"kind": x["details"]["kind"]} if x.get("details", {}).get("kind") else {})} for x in bx.credentials.audit(name=name)]
        result = {
            "signinUrl": signin,
            "credential": name,
            "agentRuns": [{"id": run["id"]}],
            "status": done["status"],
            "answer": done["result"],
            "steps": len(done["steps"]),
            # What the run showed while it waited: waiting, then received (never the code).
            "codeSteps": [s.get("state") for s in done["steps"] if s["type"] == "code"],
            "pushedAt": pushed_at,
            "audit": audit,
            "made": {"credentials": [name] if credential_made else []},
        }
finally:
    if credential_made:
        try:
            bx.credentials.delete(name)
        except Exception:
            pass
out.mkdir(parents=True, exist_ok=True)
(out / "result.json").write_text(json.dumps(result, indent=2, ensure_ascii=False))
