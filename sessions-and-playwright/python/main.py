"""Sessions and Playwright: start a session, connect Playwright to its browser, read a page, release the session.

    python python/main.py            (BOXLINE_API_KEY in the environment)

Writes output/result.json: the page title and the first 5 books with their prices.
"""
import json
import os
from pathlib import Path

from playwright.sync_api import sync_playwright

from boxline import Boxline

out = Path(os.environ.get("OUTPUT_DIR", "output"))
bx = Boxline()  # reads BOXLINE_API_KEY, and BOXLINE_API_URL for another API

# Leaving the `with` block releases the session (and ends its billing).
with bx.sessions.create(timeout=300, user_metadata={"example": "sessions-and-playwright"}) as session:
    print(f"Session: {session.id}", flush=True)
    with sync_playwright() as p:
        browser = p.chromium.connect_over_cdp(session.connect_url)  # a signed URL: treat it like a password
        page = browser.contexts[0].pages[0]
        page.goto("https://books.toscrape.com/")
        title = page.title()
        books = page.eval_on_selector_all(
            "article.product_pod",
            """items => items.slice(0, 5).map(item => ({
                title: item.querySelector("h3 a").getAttribute("title"),
                price: item.querySelector(".price_color").textContent.trim(),
            }))""",
        )
        for book in books:
            print(f"{book['price']:>8}  {book['title']}")

        # The actions API drives the same browser without Playwright: one HTTP call, here for the page as text.
        page_text = session.content("text")
        print(f'The actions API sees "{page_text["title"]}" ({len(page_text["content"])} characters of text)')

        out.mkdir(parents=True, exist_ok=True)
        result = {"sessionId": session.id, "title": title, "books": books, "actionsTitle": page_text["title"]}
        (out / "result.json").write_text(json.dumps(result, indent=2, ensure_ascii=False))
