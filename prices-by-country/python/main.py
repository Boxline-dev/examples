"""Prices by country: the same product page through residential proxies in three countries, side by side, with the
country each request really came from.

    python python/main.py            (BOXLINE_API_KEY; PRODUCT_URL, COUNTRIES=US,DE,GB; a plan with residential proxies)

Proxy traffic counts against the plan's allowance. Writes output/result.json.
"""
import json
import os
import re
from pathlib import Path

from boxline import Boxline

out = Path(os.environ.get("OUTPUT_DIR", "output"))
url = os.environ.get("PRODUCT_URL", "https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html")
countries = [c.strip().upper() for c in os.environ.get("COUNTRIES", "US,DE,GB").split(",") if c.strip()]
bx = Boxline()

rows, model_usd = [], 0.0
for country in countries:
    proxy = {"type": "residential", "country": country}
    # Where the site sees the request from: Cloudflare's trace page names the country of the address it came from.
    trace = bx.fetch("https://www.cloudflare.com/cdn-cgi/trace", format="text", proxy=proxy)
    m = re.search(r"^loc=([A-Z]{2})$", trace["content"], re.M)
    seen_from = m.group(1) if m else None
    # The product's price as that visitor sees it.
    r = bx.extract(
        url=url,
        proxy=proxy,
        prompt="The product's price as shown on the page.",
        schema={
            "type": "object",
            "properties": {"price": {"type": "number"}, "currency": {"type": "string", "description": "ISO 4217 code"},
                           "shown": {"type": "string", "description": "the price exactly as the page shows it"}},
            "required": ["price", "currency", "shown"],
        },
    )
    model_usd += r["usage"]["costUsd"]
    rows.append({"country": country, "seenFrom": seen_from, **r["data"]})
    print(f"{country}: seen from {seen_from}, {r['data']['shown']} ({r['data']['price']} {r['data']['currency']})")

out.mkdir(parents=True, exist_ok=True)
(out / "result.json").write_text(json.dumps({"url": url, "rows": rows, "usage": {"modelUsd": model_usd}}, indent=2, ensure_ascii=False))
