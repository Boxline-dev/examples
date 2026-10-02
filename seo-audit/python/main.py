"""SEO and metadata audit: titles, descriptions, headings, Open Graph and canonical tags, page by page, with a
suggested description (written by a model) for pages that have none.

    python python/main.py            (BOXLINE_API_KEY; SITE_URL for your own site, MAX_PAGES)

Writes output/report.json: each page's tags and what to fix.
"""
import json
import os
from html.parser import HTMLParser
from pathlib import Path

from boxline import Boxline

out = Path(os.environ.get("OUTPUT_DIR", "output"))
start = os.environ.get("SITE_URL", "https://books.toscrape.com/")
max_pages = int(os.environ.get("MAX_PAGES", "10"))
bx = Boxline()


class Tags(HTMLParser):
    """Collects the tags an audit looks at (Python's own HTML parser: nothing to install)."""

    def __init__(self) -> None:
        super().__init__()
        self.title, self.in_title = "", False
        self.meta: dict = {}
        self.h1 = 0
        self.canonical = ""
        self.images_without_alt = 0
        self.lang = ""

    def handle_starttag(self, tag, attrs):
        a = {k.lower(): (v or "") for k, v in attrs}
        if tag == "html":
            self.lang = a.get("lang", "")
        elif tag == "title":
            self.in_title = True
        elif tag == "meta" and (a.get("name") or a.get("property")):
            self.meta.setdefault(a.get("name") or a.get("property"), a.get("content", "").strip())
        elif tag == "h1":
            self.h1 += 1
        elif tag == "link" and "canonical" in a.get("rel", "").split():
            self.canonical = a.get("href", "")
        elif tag == "img" and "alt" not in a:
            self.images_without_alt += 1

    def handle_endtag(self, tag):
        if tag == "title":
            self.in_title = False

    def handle_data(self, data):
        if self.in_title:
            self.title += data


def audit(url: str, html: str) -> dict:
    t = Tags()
    t.feed(html)
    page = {
        "url": url,
        "title": " ".join(t.title.split()),
        "description": t.meta.get("description", ""),
        "h1": t.h1,
        "ogTitle": t.meta.get("og:title", ""),
        "ogDescription": t.meta.get("og:description", ""),
        # How the page looks when shared (Open Graph image, Twitter/X card), whether it may be listed, and its language.
        "ogImage": t.meta.get("og:image", ""),
        "twitterCard": t.meta.get("twitter:card", ""),
        "robots": t.meta.get("robots", ""),
        "lang": t.lang,
        "canonical": t.canonical,
        "imagesWithoutAlt": t.images_without_alt,
    }
    fixes = []
    if not page["title"]:
        fixes.append("title missing")
    elif len(page["title"]) > 60:
        fixes.append(f"title over 60 characters ({len(page['title'])})")
    if not page["description"]:
        fixes.append("no meta description")
    elif len(page["description"]) > 160:
        fixes.append(f"meta description over 160 characters ({len(page['description'])})")
    if page["h1"] != 1:
        fixes.append(f"{page['h1']} H1 headings (want 1)")
    if not page["ogTitle"]:
        fixes.append("no og:title")
    if not page["ogDescription"]:
        fixes.append("no og:description")
    if not page["ogImage"]:
        fixes.append("no og:image (shared links show no picture)")
    if not page["twitterCard"]:
        fixes.append("no twitter:card")
    if "noindex" in page["robots"].lower():
        fixes.append("noindex: the page asks search engines not to list it")
    if not page["lang"]:
        fixes.append("no lang attribute on <html>")
    if not page["canonical"]:
        fixes.append("no canonical link")
    if page["imagesWithoutAlt"]:
        fixes.append(f"{page['imagesWithoutAlt']} images without alt text")
    return {**page, "fixes": fixes, "suggestedDescription": None}


# 1. Crawl the site's pages as HTML (same host, the start page and the pages it links to).
job = bx.crawl.start(start, max_pages=max_pages, max_depth=1, format="html")
crawl = bx.crawl.wait(job["id"], poll=1.5, timeout=600)
report = [audit(p.get("finalUrl") or p["url"], p["content"]) for p in crawl["data"] if p.get("content") and (p.get("status") or 0) < 400]

# 2. A model suggests a description for up to 3 pages that have none.
model_usd = 0.0
for page in [p for p in report if not p["description"]][:3]:
    r = bx.extract(
        url=page["url"],
        prompt="Write a meta description for this page: one plain, specific sentence of at most 155 characters.",
        schema={"type": "object", "properties": {"description": {"type": "string"}}, "required": ["description"]},
    )
    page["suggestedDescription"] = r["data"]["description"]
    model_usd += r["usage"]["costUsd"]

for p in report:
    print(p["url"])
    print("  " + ("; ".join(p["fixes"]) or "nothing to fix"))
    if p["suggestedDescription"]:
        print(f"  suggested description: {p['suggestedDescription']}")
out.mkdir(parents=True, exist_ok=True)
(out / "report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False))
(out / "result.json").write_text(json.dumps({"start": start, "pages": len(report), "report": report, "usage": {"modelUsd": model_usd}}, indent=2, ensure_ascii=False))
