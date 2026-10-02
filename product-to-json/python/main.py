"""Product page to JSON: pull name, price, stock and specs from a product page into a fixed shape (a JSON Schema).

    python python/main.py            (BOXLINE_API_KEY; PRODUCT_URL for your own product page)

Writes output/product.json.
"""
import json
import os
from pathlib import Path

from boxline import Boxline

out = Path(os.environ.get("OUTPUT_DIR", "output"))
url = os.environ.get("PRODUCT_URL", "https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html")
bx = Boxline()

# The page renders in a real browser inside a sandbox; a model fills the schema (page text is treated as data).
r = bx.extract(
    url=url,
    prompt="The product on this page. specs: the rows of its product information table.",
    schema={
        "type": "object",
        "properties": {
            "name": {"type": "string"},
            "price": {"type": "number", "description": "the price as a number, without the currency"},
            "currency": {"type": "string", "description": "ISO 4217 code, e.g. GBP"},
            "inStock": {"type": "boolean"},
            "stockCount": {"type": ["integer", "null"], "description": "how many are available, when the page says"},
            "specs": {
                "type": "array",
                "items": {"type": "object", "properties": {"name": {"type": "string"}, "value": {"type": "string"}}, "required": ["name", "value"]},
            },
        },
        "required": ["name", "price", "currency", "inStock", "stockCount", "specs"],
    },
)
product = r["data"]
stock = f"in stock ({product.get('stockCount')})" if product["inStock"] else "out of stock"
print(f"{product['name']}: {product['price']} {product['currency']}, {stock}, {len(product['specs'])} specs")
print(f"Read {r['pages'][0]['finalUrl']} (HTTP {r['pages'][0]['status']}) with {r['model']} for ${r['usage']['costUsd']:.4f}")

out.mkdir(parents=True, exist_ok=True)
(out / "product.json").write_text(json.dumps(product, indent=2, ensure_ascii=False))
(out / "result.json").write_text(json.dumps({"url": url, "product": product, "model": r["model"], "usage": {"modelUsd": r["usage"]["costUsd"]}}, indent=2, ensure_ascii=False))
