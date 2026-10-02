"""Site to Markdown: crawl a site into clean Markdown files, one per page, for AI search (robots.txt is respected).

    python python/main.py            (BOXLINE_API_KEY; START_URL and MAX_PAGES for your own site)

Writes output/site/<page>.md (with the page's address and title at the top) and output/site/index.json.
"""
import json
import os
import re
from pathlib import Path
from urllib.parse import urlparse

from boxline import Boxline

out = Path(os.environ.get("OUTPUT_DIR", "output"))
start = os.environ.get("START_URL", "https://quotes.toscrape.com/")
max_pages = int(os.environ.get("MAX_PAGES", "6"))
bx = Boxline()

# Breadth-first from the start page, same host only, a few pages at a time; robots.txt and crawl-delay are respected.
job = bx.crawl.start(start, max_pages=max_pages, max_depth=2, format="markdown")
print(f"Crawl {job['id']} started")
done = bx.crawl.wait(job["id"], poll=1.5, timeout=600)
print(f"{done['status']}: {done['pagesDone']} pages, {done['pagesFailed']} failed, {done['skippedByRobots']} skipped by robots.txt")


def slug(url: str) -> str:
    u = urlparse(url)
    name = re.sub(r"[^a-zA-Z0-9]+", "-", (u.path + (f"?{u.query}" if u.query else "")).strip("/"))[:80]
    return name or "index"


site = out / "site"
site.mkdir(parents=True, exist_ok=True)
index = []
for page in done["data"]:
    if page.get("error") or not page.get("content") or (page.get("status") or 0) >= 400:
        continue
    url = page.get("finalUrl") or page["url"]
    file = f"{slug(url)}.md"
    (site / file).write_text(f"---\nurl: {url}\ntitle: {json.dumps(page.get('title') or '')}\n---\n\n{page['content']}\n")
    index.append({"url": url, "title": page.get("title") or "", "file": file, "chars": len(page["content"])})
    print(f"  {file}  {len(page['content'])} chars  {page.get('title')}")

(site / "index.json").write_text(json.dumps(index, indent=2, ensure_ascii=False))
result = {"start": start, "crawlId": job["id"], "status": done["status"], "pagesDone": done["pagesDone"], "skippedByRobots": done["skippedByRobots"], "files": index}
(out / "result.json").write_text(json.dumps(result, indent=2, ensure_ascii=False))
