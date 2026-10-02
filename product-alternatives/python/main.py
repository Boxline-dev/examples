"""Product alternatives: read a product page, find comparable products (from a web search, or the candidate pages you
give), rank them by how close they are with a reason each, and show the price difference. Prices are remembered,
so the next run says which went up or down.

    python python/main.py            (BOXLINE_API_KEY; PRODUCT_URL; CANDIDATES comma-separated, else a search)

Writes output/result.json and output/alternatives.md.
"""
import hashlib
import json
import os
from pathlib import Path

from boxline import Boxline

out = Path(os.environ.get("OUTPUT_DIR", "output"))
state_dir = Path(os.environ.get("STATE_DIR", str(out / "state")))
product_url = os.environ.get("PRODUCT_URL", "https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html")
given = [u.strip() for u in os.environ.get("CANDIDATES", "").split(",") if u.strip()]
bx = Boxline()

PRODUCT = {
    "type": "object",
    "properties": {
        "url": {"type": "string"},
        "name": {"type": "string"},
        "price": {"type": ["number", "null"], "description": "a number without the currency sign"},
        "currency": {"type": ["string", "null"], "description": "ISO 4217"},
        "category": {"type": ["string", "null"]},
        "features": {"type": "array", "items": {"type": "string"}, "description": "what it is and does, in a few words each"},
    },
    "required": ["url", "name", "price", "currency", "category", "features"],
}

# 1. The product itself.
base = bx.extract(url=product_url, prompt="The product on this page. url: the page's address as given.", schema=PRODUCT)
model_usd = base["usage"]["costUsd"]
product = {**base["data"], "url": product_url}
print(f"{product['name']}: {product['price']} {product['currency'] or ''} ({product['category'] or 'no category'})")

# 2. Candidates: the pages given, or product pages a search finds (not this one).
searches, candidates = 0, given
if not candidates:
    found = bx.search(f"{product['name']} alternatives similar {product['category'] or ''}".strip(), limit=10)
    searches = 0 if found["cached"] else 1
    candidates = [x["url"] for x in found["results"] if x["url"] != product_url][:6]
item = {**PRODUCT, "properties": {**PRODUCT["properties"], "similarity": {"type": "number"}, "why": {"type": "string"}}, "required": [*PRODUCT["required"], "similarity", "why"]}
r = bx.extract(
    urls=candidates[:10],
    prompt=(
        f'Each page may sell a product. For each page, the product on it, and how close it is to this one: "{product["name"]}" ({product["category"] or "?"}; {", ".join(product["features"])}). '
        "similarity: 0 (nothing alike) to 1 (the same kind of thing for the same buyer); why: one sentence. Pages that sell no product get similarity 0. url: the page's address as given."
    ),
    schema={"type": "object", "properties": {"items": {"type": "array", "items": item}}, "required": ["items"]},
)
model_usd += r["usage"]["costUsd"]

# 3. Ranked, with the price difference, and the change since the last run.
state_dir.mkdir(parents=True, exist_ok=True)
state_file = state_dir / f"{hashlib.sha256(product_url.encode()).hexdigest()[:16]}.json"
before = json.loads(state_file.read_text()) if state_file.exists() else {}
ranked = []
for i, it in enumerate(r["data"]["items"]):
    url = it["url"] if it["url"] in candidates else (candidates[i] if i < len(candidates) else it["url"])
    if it["similarity"] <= 0:
        continue
    diff = round(it["price"] - product["price"], 2) if it["price"] is not None and product["price"] is not None and it["currency"] == product["currency"] else None
    change = {"from": before[url], "to": it["price"]} if url in before and before[url] != it["price"] else None
    ranked.append({**it, "url": url, "priceDiff": diff, "priceChange": change})
ranked.sort(key=lambda x: -x["similarity"])
state_file.write_text(json.dumps({product_url: product["price"], **{x["url"]: x["price"] for x in ranked}}))

for x in ranked:
    diff = "" if x["priceDiff"] is None else ", same price" if x["priceDiff"] == 0 else f", {'+' if x['priceDiff'] > 0 else ''}{x['priceDiff']} {x['currency']}"
    was = f" (was {x['priceChange']['from']})" if x["priceChange"] else ""
    print(f"  {x['similarity']:.2f}  {x['name']}: {x['price']} {x['currency'] or ''}{diff}{was}\n        {x['why']}")
md = [f"# Alternatives to {product['name']}", "", f"[{product['name']}]({product_url}): {product['price']} {product['currency'] or ''}", "", "| | Product | Price | Difference | Why |", "|---|---|---|---|---|"]
md += [f"| {x['similarity']:.2f} | [{x['name']}]({x['url']}) | {x['price']} {x['currency'] or ''} | {'' if x['priceDiff'] is None else x['priceDiff']} | {x['why']} |" for x in ranked] + [""]
out.mkdir(parents=True, exist_ok=True)
(out / "alternatives.md").write_text("\n".join(md))
(out / "result.json").write_text(json.dumps({"product": product, "candidates": candidates, "alternatives": ranked, "usage": {"modelUsd": model_usd, "searches": searches}}, indent=2, ensure_ascii=False))
