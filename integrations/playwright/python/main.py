"""Playwright with Boxline: connect Playwright to a Boxline session's browser over CDP and use it as usual (locators,
routes, screenshots). No AI, no model cost.

    pip install -r requirements.txt && python main.py        (BOXLINE_API_KEY in the environment)

Writes output/result.json and output/page.png. No browser download is needed: `playwright install` is not required
to connect to a remote browser.
"""
import json
import os
import re
from pathlib import Path

from playwright.sync_api import sync_playwright

from boxline import Boxline

out = Path(os.environ.get("OUTPUT_DIR", "output"))
bx = Boxline()

with bx.sessions.create(timeout=300, user_metadata={"example": "integrations/playwright"}) as session, sync_playwright() as p:
    print(f"Session: {session.id}", flush=True)
    # connect_url is a signed WebSocket address: treat it like a password.
    browser = p.chromium.connect_over_cdp(session.connect_url)
    # The session's browser has one context with one page; use them, or open more with context.new_page().
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()

    # Routes run in Playwright on this computer: every request the page makes passes through here (block, change or
    # answer it); this one counts them by type and lets them through.
    requests = {}

    def count(route):
        requests[route.request.resource_type] = requests.get(route.request.resource_type, 0) + 1
        route.continue_()

    context.route("**/*", count)

    page.goto("https://quotes.toscrape.com/")
    quotes = page.locator(".quote")
    first = quotes.evaluate_all(
        "els => els.slice(0, 3).map((el) => ({ text: el.querySelector('.text').textContent.trim(), author: el.querySelector('.author').textContent.trim() }))"
    )
    page.get_by_role("link", name=re.compile("Next")).click()
    page.wait_for_url(re.compile(r"/page/2/$"))
    page2_author = quotes.first.locator(".author").text_content().strip()

    out.mkdir(parents=True, exist_ok=True)
    png = page.screenshot(path=str(out / "page.png"))
    for q in first:
        print(f"{q['author']}: {q['text'][:70]}")
    print(f"Page 2 starts with {page2_author}; requests seen: {requests}; screenshot {len(png)} bytes")
    result = {"sessionId": session.id, "quotes": first, "page2Url": page.url, "page2Author": page2_author, "requests": requests, "screenshotBytes": len(png)}
    (out / "result.json").write_text(json.dumps(result, indent=2, ensure_ascii=False))
