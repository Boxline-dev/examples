"""Get a page, or a browser? The same site two ways: fetch (one call, the page as Markdown: for reading) and a session
(a browser that stays open between calls: for clicking through pages, forms and sign-ins).

    python python/main.py            (BOXLINE_API_KEY in the environment; PAGE_URL for another site)
"""
import json
import os
import time
from pathlib import Path

from boxline import Boxline

out = Path(os.environ.get("OUTPUT_DIR", "output"))
url = os.environ.get("PAGE_URL", "https://quotes.toscrape.com/")
bx = Boxline()

# 1. fetch: the page is rendered in a real browser inside a sandbox and comes back as Markdown, with its links.
t0 = time.monotonic()
page = bx.fetch(url, format="markdown", links=True)
fetched = {
    "title": page["title"],
    "status": page["status"],
    "chars": len(page["content"]),
    "links": len(page.get("links") or []),
    "ms": round((time.monotonic() - t0) * 1000),
    "hasEinstein": "Albert Einstein" in page["content"],
}
print(f'fetch: "{page["title"]}" (HTTP {page["status"]}), {fetched["chars"]} characters of Markdown and {fetched["links"]} links in {fetched["ms"]} ms')

# 2. A session: the browser keeps its page, cookies and history between calls, so it can click on to page 3.
with bx.sessions.create(timeout=300, user_metadata={"example": "fetch-or-browser"}) as session:
    print(f"Session: {session.id}", flush=True)
    t0 = time.monotonic()
    session.goto(url)
    pages = []
    for _ in range(2):
        results = session.actions([
            {"action": "click", "selector": "li.next a"},
            {"action": "wait", "selector": ".quote"},
            {"action": "evaluate", "expression": "({ url: location.href, authors: [...document.querySelectorAll('.quote .author')].map((a) => a.textContent) })"},
        ])
        read = results[-1]["value"]
        print(f"session: {read['url']}: {len(read['authors'])} quotes, the first by {read['authors'][0]}")
        pages.append(read)
    browsed = {"ms": round((time.monotonic() - t0) * 1000), "pages": pages}

    out.mkdir(parents=True, exist_ok=True)
    (out / "result.json").write_text(json.dumps({"url": url, "fetch": fetched, "session": browsed}, indent=2, ensure_ascii=False))
    print("Use fetch to read a page; use a session when you need to act on it (click, type, sign in, download).")
