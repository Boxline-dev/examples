"""My invoices: open your billing page signed in with a profile and download the invoices of the last 3 months.

    BILLING_URL=https://… PROFILE_ID=… python python/main.py     (BOXLINE_API_KEY; MONTHS, default 3)

PROFILE_ID is a profile that is signed in to the site (make one with the "save-a-login" example). The browser
downloads each invoice into the session's downloads/ folder; the files API copies them to output/invoices/.
"""
import json
import os
import re
import time
from datetime import date
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright

from boxline import Boxline, NotFoundError

out = Path(os.environ.get("OUTPUT_DIR", "output"))
billing = os.environ.get("BILLING_URL")
profile_id = os.environ.get("PROFILE_ID")
months = int(os.environ.get("MONTHS", "3"))
if not billing or not profile_id:
    raise SystemExit("Set BILLING_URL (your billing page) and PROFILE_ID (a profile signed in to that site)")
bx = Boxline()

# The first day of the month `months - 1` months ago: "the last 3 months" is this month and the two before.
today = date.today()
y, m = divmod(today.year * 12 + today.month - 1 - (months - 1), 12)
since = date(y, m + 1, 1).isoformat()


def downloads(session) -> list:
    """The files in downloads/ (none before the first download: the folder does not exist yet)."""
    try:
        return session.files.list("downloads")
    except NotFoundError:
        return []


def new_download(session, before: set, timeout: float = 30) -> dict:
    """Waits for a new, finished file in downloads/ (one that was not there before the click)."""
    deadline, last = time.monotonic() + timeout, ""
    while time.monotonic() < deadline:
        fresh = next((e for e in downloads(session) if e["type"] == "file" and e["name"] not in before and not e["name"].endswith(".crdownload")), None)
        if fresh and f"{fresh['name']}:{fresh['size']}" == last:
            return fresh  # the same size twice: it has finished writing
        last = f"{fresh['name']}:{fresh['size']}" if fresh else ""
        time.sleep(0.5)
    raise SystemExit("the download did not arrive")


with bx.sessions.create(timeout=600, profile=profile_id, user_metadata={"example": "my-invoices"}) as session, sync_playwright() as p:
    print(f"Session: {session.id}", flush=True)
    page = p.chromium.connect_over_cdp(session.connect_url).contexts[0].pages[0]
    page.goto(billing)
    if re.search(r"log.?in|sign.?in", page.url, re.I):
        raise SystemExit(f"the profile is not signed in (the site sent the browser to {page.url}): run save-a-login again")

    # The billing table: each row's cells and its PDF link; the date is the first cell that reads as YYYY-MM-DD.
    rows = page.eval_on_selector_all(
        "tr",
        """trs => trs.map((tr) => ({
            cells: [...tr.querySelectorAll("td")].map((td) => td.textContent.trim()),
            pdf: tr.querySelector('a[href$=".pdf"], a[href*=".pdf?"]')?.href ?? null,
        }))""",
    )
    recent = []
    for row in rows:
        row_date = next((c for c in row["cells"] if re.fullmatch(r"\d{4}-\d{2}-\d{2}", c)), "")
        if row["pdf"] and row_date >= since:
            recent.append({**row, "date": row_date})
    print(f"{len(recent)} invoices since {since} on {page.url}")

    (out / "invoices").mkdir(parents=True, exist_ok=True)
    invoices = []
    for row in recent:
        before = {e["name"] for e in downloads(session)}
        page.click(f'a[href="{urlparse(row["pdf"]).path}"]')
        file = new_download(session, before)
        data = session.files.read(f"downloads/{file['name']}")
        (out / "invoices" / file["name"]).write_bytes(data)
        amount = next((c for c in row["cells"] if re.search(r"[€$£]\s?\d|\d\s?(EUR|USD|GBP)", c)), None)
        invoices.append({"id": row["cells"][0], "date": row["date"], "amount": amount, "file": f"invoices/{file['name']}", "bytes": len(data)})
        print(f"  {row['date']}  {amount or ''}  -> output/invoices/{file['name']} ({len(data)} bytes)")

    (out / "result.json").write_text(json.dumps({"billingUrl": billing, "months": months, "since": since, "invoices": invoices}, indent=2, ensure_ascii=False))
