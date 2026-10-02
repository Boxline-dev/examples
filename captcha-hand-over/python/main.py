"""CAPTCHA hand-over: open a form behind a CAPTCHA, see the platform detect it, have a person solve it in the live
view, then carry on and submit the form. Only on sites you own or may automate (the Acceptable Use Policy).

    FORM_URL=https://… python python/main.py     (BOXLINE_API_KEY; NAME to type into the form's name field)

The session's captcha="ask" (the default) means: when a CAPTCHA waits for a person, say so and wait; nothing is solved
automatically. Writes output/result.json.
"""
import json
import os
import time
from pathlib import Path

from boxline import Boxline

out = Path(os.environ.get("OUTPUT_DIR", "output"))
form_url = os.environ.get("FORM_URL")
if not form_url:
    raise SystemExit("Set FORM_URL to a form of your own site that shows a CAPTCHA")
name = os.environ.get("NAME", "Ada Lovelace")
bx = Boxline()

with bx.sessions.create(captcha="ask", keep_alive=True, timeout=600, user_metadata={"example": "captcha-hand-over"}) as session:
    print(f"Session: {session.id}", flush=True)
    session.goto(form_url)
    # The platform looks twice, about 2 s apart, before it says a CAPTCHA waits for a person.
    deadline = time.monotonic() + 30
    while not session.refresh().data.get("attention") and time.monotonic() < deadline:
        time.sleep(1)
    attention = session.data.get("attention")
    if attention:
        print(f"\nA CAPTCHA ({attention['kind']}) is waiting for a person on {attention['url']}: solve it in the live view "
              f"(the link works like a password):\n  {session.live_url}\n", flush=True)
        session.wait_for_human(timeout=300)  # raises CaptchaTimeoutError if nobody solves it
        print(f"The CAPTCHA ({attention['kind']}) was solved.")

    session.fill('input[name="name"]', name)
    session.click('form [type="submit"], form button')
    session.wait(ms=1000)
    page = session.content("text")
    print(f'After submitting: "{page["title"]}": {" ".join(page["content"].split())[:120]}')

    events = [{"state": (e.get("data") or {}).get("state"), "kind": (e.get("data") or {}).get("kind"), "waitedMs": (e.get("data") or {}).get("waitedMs")}
              for e in session.events(types=["captcha"]).data]
    out.mkdir(parents=True, exist_ok=True)
    result = {"formUrl": form_url, "attention": attention, "detected": bool(attention), "events": events, "title": page["title"], "pageSays": page["content"][:600]}
    (out / "result.json").write_text(json.dumps(result, indent=2, ensure_ascii=False))
