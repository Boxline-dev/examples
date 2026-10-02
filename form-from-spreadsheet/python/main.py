"""Fill a form from a spreadsheet: read rows from a CSV with Python in the session's shell, and fill one form per row
with plain-English steps, pausing before the first submit so you can check it in the live view.

    python python/main.py            (BOXLINE_API_KEY; SHEET_URL: a CSV with name,phone,email columns; FORM_URL; ROWS)

The rows' values go to the steps as %name%, %phone% and %email% variables: the model picks the fields, the values are
filled in on the server and never shown to it. Writes output/result.json with what the page said after each submit.
"""
import json
import os
from pathlib import Path

from boxline import Boxline

out = Path(os.environ.get("OUTPUT_DIR", "output"))
# A demo CSV served by httpbin.org (it decodes the base64 in the address): Ada Lovelace, Alan Turing, Grace Hopper.
DEMO_SHEET = (
    "https://httpbin.org/base64/bmFtZSxwaG9uZSxlbWFpbApBZGEgTG92ZWxhY2UsKzEgNTU1IDAxMDAsYWRhQGV4YW1wbGUuY29tCkFsYW4gVHVyaW5nLCsxIDU1"
    "NSAwMTAxLGFsYW5AZXhhbXBsZS5jb20KR3JhY2UgSG9wcGVyLCsxIDU1NSAwMTAyLGdyYWNlQGV4YW1wbGUuY29tCg=="
)
sheet_url = os.environ.get("SHEET_URL", DEMO_SHEET)
form_url = os.environ.get("FORM_URL", "https://httpbin.org/forms/post")
max_rows = int(os.environ.get("ROWS", "3"))
bx = Boxline()

with bx.sessions.create(shell=True, keep_alive=True, timeout=900, user_metadata={"example": "form-from-spreadsheet"}) as session:
    print(f"Session: {session.id}", flush=True)
    # 1. The shell: download the sheet and read it with Python's csv module.
    r = session.exec(
        """mkdir -p data && curl -sSfL --max-time 60 -o data/sheet.csv "$SHEET_URL" && python3 -c 'import csv, json; print(json.dumps(list(csv.DictReader(open("data/sheet.csv")))))'""",
        env={"SHEET_URL": sheet_url},
    )
    if r["exitCode"] != 0:
        raise SystemExit(f"could not read the sheet: {r['stderr'].strip()}")
    rows = json.loads(r["stdout"])[:max_rows]
    print(f"{len(rows)} rows to fill from the sheet")

    # 2. One form per row: plain-English steps pick the fields; the values stay out of the model's sight.
    submitted, model_usd = [], 0.0
    for i, row in enumerate(rows):
        session.goto(form_url)
        steps = session.actions([
            {"action": "step", "instruction": "type %name% into the customer name field", "variables": {"name": row["name"]}},
            {"action": "step", "instruction": "type %phone% into the telephone field", "variables": {"phone": row["phone"]}},
            {"action": "step", "instruction": "type %email% into the email address field", "variables": {"email": row["email"]}},
        ])
        failed = next((s for s in steps if not s["ok"]), None)
        if failed:
            raise SystemExit(f"a step failed: {failed.get('error')}")
        model_usd += sum(((s.get("value") or {}).get("usage") or {}).get("costUsd", 0) for s in steps)
        if i == 0:
            print(f"\nRow 1 is filled in. Check it in the live view (the link works like a password):\n  {session.live_url}")
            input("Check the first row in the live view, then press Enter to submit it: ")
        session.click("form button, form [type=submit]")
        session.wait(ms=1000)
        text = session.content("text")["content"]
        submitted.append({"name": row["name"], "pageSays": text[:600]})
        print(f"Row {i + 1} ({row['name']}) submitted: {' '.join(text.split())[:100]}")

    out.mkdir(parents=True, exist_ok=True)
    (out / "result.json").write_text(json.dumps({"sheetUrl": sheet_url, "formUrl": form_url, "rows": submitted, "reviewed": True, "usage": {"modelUsd": model_usd}}, indent=2, ensure_ascii=False))
