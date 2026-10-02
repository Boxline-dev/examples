"""Download and add up: the browser downloads a CSV report, Python in the shell adds up its revenue column and saves
the total, and the browser types the total into a form. One session: browser, shell and files share /workspace.

    python python/main.py            (BOXLINE_API_KEY; REPORT_PAGE_URL: a page with a CSV link, FORM_URL; a shell plan)

Without REPORT_PAGE_URL a demo report page is made in the browser. Writes output/report.csv, output/total.txt and
output/result.json (with what the form page said back).
"""
import json
import os
import re
from pathlib import Path
from urllib.parse import quote

from playwright.sync_api import sync_playwright

from boxline import Boxline

out = Path(os.environ.get("OUTPUT_DIR", "output"))
report_page = os.environ.get("REPORT_PAGE_URL")
form_url = os.environ.get("FORM_URL", "https://httpbin.org/forms/post")
bx = Boxline()

with bx.sessions.create(shell=True, timeout=600, user_metadata={"example": "download-and-add-up"}) as session, sync_playwright() as p:
    print(f"Session: {session.id}", flush=True)
    # 1. The browser downloads the report; downloads land in the workspace's downloads/ folder.
    page = p.chromium.connect_over_cdp(session.connect_url).contexts[0].pages[0]
    if report_page:
        page.goto(report_page)
    else:
        csv = "month,revenue\nJan,1200\nFeb,1850\nMar,2410\n"
        page.set_content(f'<h1>Quarterly report</h1><a download="report.csv" href="data:text/csv,{quote(csv)}">Download report</a>')
    page.get_by_role("link", name=re.compile("download", re.I)).first.click()
    file = session.files.wait_for("downloads/*.csv", 30_000)  # waits until it has finished writing
    print(f"Downloaded {file['path']} ({file['size']} bytes)")

    # 2. The shell: Python adds up the revenue column and writes the total.
    py = session.exec(f"""mkdir -p output && python3 - "{file['path']}" <<'PY'
import csv, sys
total = sum(float(row["revenue"]) for row in csv.DictReader(open(sys.argv[1])))
open("output/total.txt", "w").write(f"{{total:g}}")
print(f"total revenue: {{total:g}}")
PY""")
    if py["exitCode"] != 0:
        raise SystemExit(f"Python failed: {py['stderr']}")
    total = session.files.read_text("output/total.txt").strip()  # the files API reads what the shell wrote
    print(py["stdout"].strip())

    # 3. The browser types the total into the form's first text box and submits it.
    page.goto(form_url)
    page.locator("form input:not([type]), form input[type=text]").first.fill(total)
    with page.expect_navigation():
        page.locator("form button, form [type=submit]").first.click()
    page_says = page.locator("body").inner_text().strip()[:1000]
    print("The form page says: " + " ".join(page_says.split())[:160])

    out.mkdir(parents=True, exist_ok=True)
    (out / "report.csv").write_bytes(session.files.read(file["path"]))
    (out / "total.txt").write_text(total + "\n")
    (out / "result.json").write_text(json.dumps({"report": file["path"], "total": total, "form": form_url, "pageSays": page_says}, indent=2))
