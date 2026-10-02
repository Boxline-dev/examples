"""Company details from its legal pages: crawl a site's pages, pick its terms, privacy and imprint pages, and have a
model read the organisation's legal name and postal address from them.

    python python/main.py            (BOXLINE_API_KEY; SITE_URL for another site)

Writes output/company.json.
"""
import json
import os
import re
from pathlib import Path
from urllib.parse import urlparse

from boxline import Boxline

out = Path(os.environ.get("OUTPUT_DIR", "output"))
site = os.environ.get("SITE_URL", "https://www.eff.org/")
bx = Boxline()
LEGAL = re.compile(r"terms|privacy|legal|imprint|impressum|about|contact|policy", re.I)
FIRST = re.compile(r"privacy|imprint|impressum|legal", re.I)

# 1. The start page and the pages it links to (same site, robots.txt respected).
job = bx.crawl.start(site, max_pages=40, max_depth=1, format="text")
crawl = bx.crawl.wait(job["id"], poll=1.5, timeout=600)
legal = [p for p in crawl["data"] if not p.get("error") and (p.get("status") or 0) < 400 and (LEGAL.search(urlparse(p["url"]).path) or LEGAL.search(p.get("title") or ""))]
legal = sorted(legal, key=lambda p: not FIRST.search(p["url"]))[:4]
print(f"{len(crawl['data'])} pages crawled; reading {len(legal)}: {', '.join(urlparse(p['url']).path for p in legal)}")
if not legal:
    raise SystemExit("no terms, privacy or imprint page is linked from the start page")

# 2. A model reads them into a fixed shape (the pages render in a real browser; their text is treated as data).
r = bx.extract(
    urls=[p.get("finalUrl") or p["url"] for p in legal],
    prompt="The legal name and postal address of the organisation that runs this website, and the address (URL) of the page that says so.",
    schema={
        "type": "object",
        "properties": {"legalName": {"type": "string"}, "address": {"type": "string", "description": "the postal address on one line"}, "foundOn": {"type": "string"}},
        "required": ["legalName", "address", "foundOn"],
    },
)
company = r["data"]
print(f"{company['legalName']}, {company['address']} (from {company['foundOn']})")
out.mkdir(parents=True, exist_ok=True)
(out / "company.json").write_text(json.dumps(company, indent=2, ensure_ascii=False))
result = {"site": site, "read": [p.get("finalUrl") or p["url"] for p in legal], "company": company, "usage": {"modelUsd": r["usage"]["costUsd"]}}
(out / "result.json").write_text(json.dumps(result, indent=2, ensure_ascii=False))
