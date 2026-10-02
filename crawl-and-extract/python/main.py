"""Crawl and extract: find every page of one kind on a site (the crawl follows only links that match a pattern), then
pull the same fields from each with one schema, 10 pages per extract call, into JSONL and CSV. Each price is then
checked against the crawled page's own text, so a model slip shows up as "not verified".

    python python/main.py            (BOXLINE_API_KEY; START_URL, INCLUDE, MAX_PAGES)

The default: every book in a books.toscrape.com category (a demo shop). The crawl respects robots.txt.
Writes output/items.jsonl, output/items.csv and output/result.json.
"""
import csv
import json
import os
import re
from pathlib import Path

from boxline import Boxline

out = Path(os.environ.get("OUTPUT_DIR", "output"))
start = os.environ.get("START_URL", "https://books.toscrape.com/catalogue/category/books/poetry_23/index.html")
include = os.environ.get("INCLUDE", r"/catalogue/[^/]+_\d+/index\.html$")  # product pages, not categories
max_pages = int(os.environ.get("MAX_PAGES", "40"))
bx = Boxline()

# 1. Discover: the start page, then only links that match the pattern (one level deep).
job = bx.crawl.start(start, max_pages=max_pages, max_depth=1, include=[include], format="markdown")
done = bx.crawl.wait(job["id"], poll=1.5, timeout=600)
pattern = re.compile(include)
found = [p for p in done["data"] if pattern.search(p.get("finalUrl") or p["url"]) and not p.get("error") and (p.get("status") or 0) < 400]
print(f"Crawled {done['pagesDone']} pages from {start}; {len(found)} match {include}")
if not found:
    raise SystemExit("no page matched INCLUDE; check the pattern against the site's addresses")

SCHEMA = {
    "type": "object",
    "properties": {
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "url": {"type": "string"},
                    "title": {"type": "string"},
                    "price": {"type": "number"},
                    "currency": {"type": "string"},
                    "rating": {"type": ["integer", "null"]},
                    "inStock": {"type": "boolean"},
                    "stockCount": {"type": ["integer", "null"]},
                },
                "required": ["url", "title", "price", "currency", "rating", "inStock", "stockCount"],
            },
        }
    },
    "required": ["items"],
}

# 2. Extract: the same schema for every page, 10 pages per call (each page's row says which page it is).
items, model_usd = [], 0.0
for i in range(0, len(found), 10):
    batch = found[i : i + 10]
    r = bx.extract(
        urls=[p.get("finalUrl") or p["url"] for p in batch],
        prompt="One row per page: the product on it. url: the page's address as given. price: a number without the currency sign; currency: ISO 4217. rating: 1 to 5 stars, null when none. stockCount: the number available when the page says.",
        schema=SCHEMA,
    )
    model_usd += r["usage"]["costUsd"]
    # 3. Verify: the price must be written on that page (as crawled), with two decimals.
    for it in r["data"]["items"]:
        page = next((p for p in batch if it["url"] in ((p.get("finalUrl") or p["url"]), p["url"])), None)
        items.append({**it, "verified": bool(page and f"{it['price']:.2f}" in (page.get("content") or ""))})
    print(f"  pages {i + 1}–{i + len(batch)}: {len(r['data']['items'])} rows (${r['usage']['costUsd']:.4f})")

unverified = [x for x in items if not x["verified"]]
print(f"{len(items)} rows, {len(items) - len(unverified)} prices verified against the page" + (f"; check: {', '.join(x['title'] for x in unverified)}" if unverified else ""))
for x in items[:5]:
    stock = f"in stock ({x['stockCount'] if x['stockCount'] is not None else '?'})" if x["inStock"] else "out of stock"
    print(f"  {x['title']}: {x['price']} {x['currency']}, {x['rating'] if x['rating'] is not None else '?'}★, {stock}")

out.mkdir(parents=True, exist_ok=True)
(out / "items.jsonl").write_text("".join(json.dumps(x, ensure_ascii=False) + "\n" for x in items))
cols = ["title", "price", "currency", "rating", "inStock", "stockCount", "verified", "url"]
with open(out / "items.csv", "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(cols)
    for x in items:
        w.writerow(["" if x[c] is None else ("true" if x[c] is True else "false" if x[c] is False else x[c]) for c in cols])
result = {"start": start, "include": include, "crawlId": job["id"], "crawled": done["pagesDone"], "matched": [p.get("finalUrl") or p["url"] for p in found], "rows": len(items), "verified": len(items) - len(unverified), "unverified": [x["url"] for x in unverified], "usage": {"modelUsd": model_usd}}
(out / "result.json").write_text(json.dumps(result, indent=2, ensure_ascii=False))
