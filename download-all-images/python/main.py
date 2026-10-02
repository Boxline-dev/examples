"""Download all images: the browser finds every image on a page, the shell downloads them into the workspace with
the browser's cookies and zips them, and the files API brings the zip back.

    python python/main.py            (BOXLINE_API_KEY; PAGE_URL for another page; a plan with shell sessions)

Writes output/images.zip and output/result.json.
"""
import json
import os
from pathlib import Path

from playwright.sync_api import sync_playwright

from boxline import Boxline

out = Path(os.environ.get("OUTPUT_DIR", "output"))
url = os.environ.get("PAGE_URL", "https://books.toscrape.com/")
script = (Path(__file__).parent.parent / "download.sh").read_bytes()
bx = Boxline()

with bx.sessions.create(shell=True, timeout=600, user_metadata={"example": "download-all-images"}) as session:
    print(f"Session: {session.id}", flush=True)
    with sync_playwright() as p:
        # 1. The browser: every image the page shows, as absolute addresses.
        page = p.chromium.connect_over_cdp(session.connect_url).contexts[0].pages[0]
        page.goto(url, wait_until="load")
        srcs = page.eval_on_selector_all("img", "imgs => imgs.map((i) => i.currentSrc || i.src)")
        images = [s for s in dict.fromkeys(srcs) if s.startswith(("http://", "https://"))][:100]
        print(f"{len(images)} images on {page.url}")

        # 2. The shell: download them with the browser's cookies (so images behind a sign-in work too), then zip them.
        session.export_cookies("cookies.txt")
        session.files.write("images.txt", "\n".join(images) + "\n")
        session.files.write("download.sh", script)
        r = session.exec("bash download.sh", timeout_ms=300_000)
        if r["exitCode"] != 0:
            raise SystemExit(f"the download failed: {r['stderr'].strip()}")
        if r["stderr"].strip():
            print(r["stderr"].strip())
        saved = int(r["stdout"].strip())

        # 3. The files API: the zip, back on this computer.
        zip_bytes = session.files.read("output/images.zip")
        out.mkdir(parents=True, exist_ok=True)
        (out / "images.zip").write_bytes(zip_bytes)
        print(f"{saved} images saved in the workspace's output/images; output/images.zip ({len(zip_bytes) // 1024} KB) is here")
        result = {"page": url, "found": len(images), "saved": saved, "zipBytes": len(zip_bytes), "images": images}
        (out / "result.json").write_text(json.dumps(result, indent=2))
