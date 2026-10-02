"""Screenshots to a PDF report: screenshot several pages in the session's browser, then combine them into one PDF
with Python (Pillow) in the session's shell.

    python python/main.py            (BOXLINE_API_KEY; URLS: comma-separated pages; a plan with shell sessions)

Writes output/shot-N.png and output/report.pdf.
"""
import json
import os
from pathlib import Path

from boxline import Boxline

out = Path(os.environ.get("OUTPUT_DIR", "output"))
urls = [u.strip() for u in os.environ.get("URLS", "https://books.toscrape.com/,https://quotes.toscrape.com/,https://httpbin.org/").split(",") if u.strip()]
combine = (Path(__file__).parent.parent / "combine.py").read_bytes()
bx = Boxline()

with bx.sessions.create(shell=True, timeout=600, user_metadata={"example": "screenshots-to-pdf"}) as session:
    print(f"Session: {session.id}", flush=True)
    out.mkdir(parents=True, exist_ok=True)
    shots, pages = [], []
    for i, url in enumerate(urls, start=1):
        # The actions API: open the page and screenshot it (PNG bytes), then keep it in the workspace for the shell.
        title = session.goto(url)["title"]
        png = session.screenshot()
        file = f"output/shot-{i}.png"
        session.files.write(file, png)
        (out / f"shot-{i}.png").write_bytes(png)
        shots.append(file)
        pages.append({"url": url, "title": title, "file": file})
        print(f"Saved {file}: {title}")

    session.files.write("combine.py", combine)
    r = session.exec(f"python3 combine.py {' '.join(shots)}")
    if r["exitCode"] != 0:
        raise SystemExit(f"Pillow failed: {r['stderr'].strip()}")
    pdf = session.files.read("output/report.pdf")
    (out / "report.pdf").write_bytes(pdf)
    print(f"output/report.pdf: {r['stdout'].strip()} pages, {len(pdf) // 1024} KB")
    (out / "result.json").write_text(json.dumps({"pages": pages, "pdfPages": int(r["stdout"].strip()), "pdfBytes": len(pdf)}, indent=2, ensure_ascii=False))
