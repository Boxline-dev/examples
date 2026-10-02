"""Link checker: crawl the pages a page links to and report the broken ones and the slow ones.

    python python/main.py            (BOXLINE_API_KEY; SITE_URL for your own page, MAX_PAGES, SLOW_MS)

Writes output/result.json: every page checked, the broken ones (HTTP 400+ or not loading) and the slow ones.
"""
import json
import os
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urlparse

from boxline import Boxline, BoxlineError

out = Path(os.environ.get("OUTPUT_DIR", "output"))
start = os.environ.get("SITE_URL", "https://books.toscrape.com/")
max_pages = int(os.environ.get("MAX_PAGES", "20"))
slow_ms = int(os.environ.get("SLOW_MS", "2000"))
max_external = int(os.environ.get("MAX_EXTERNAL", "15"))
bx = Boxline()

# 1. Crawl the page and the pages it links to on the same site (depth 1): each one's HTTP status, or why it failed.
job = bx.crawl.start(start, max_pages=max_pages, max_depth=1, format="text")
crawl = bx.crawl.wait(job["id"], poll=1.5, timeout=600)
print(f"Crawled {len(crawl['data'])} pages from {start}")

broken, timed = [], []
for page in crawl["data"]:
    if page.get("error") or (page.get("status") or 0) >= 400:
        broken.append({"url": page["url"], "status": page.get("status"), "error": page.get("error")})
        continue
    # 2. Time each page that loaded, one at a time to be polite to the site (fetch reports how long the page took).
    try:
        r = bx.fetch(page["url"], format="text", timeout_ms=30_000)
        timed.append({"url": page["url"], "status": r["status"], "ms": r["ms"]})
    except BoxlineError as e:
        broken.append({"url": page["url"], "status": None, "error": e.code})
slow = sorted((t for t in timed if t["ms"] > slow_ms), key=lambda t: -t["ms"])


# 3. Links to other sites from the start page, opened in a sandboxed browser three at a time. "Blocked" is a site that
#    refuses automated visitors (401, 403, 429 or a CAPTCHA): the link may well work for people, so check it by hand.
def judge(url):
    try:
        p = bx.fetch(url, format="text", timeout_ms=30_000)
    except BoxlineError as e:
        return {"url": url, "verdict": "broken", "status": None, "why": str(e)}
    status = p["status"]
    if p.get("captcha") or status in (401, 403, 429):
        return {"url": url, "verdict": "blocked", "status": status, "why": f"a {p['captcha']} CAPTCHA" if p.get("captcha") else f"HTTP {status}"}
    if (status or 0) >= 400:
        return {"url": url, "verdict": "broken", "status": status, "why": f"HTTP {status}"}
    return {"url": url, "verdict": "working", "status": status, "why": f"HTTP {status}"}


home = bx.fetch(start, format="text", links=True)
host = urlparse(home["finalUrl"]).netloc
outbound = list(dict.fromkeys(l.split("#")[0] for l in home.get("links") or [] if urlparse(l).netloc != host))[:max_external]
with ThreadPoolExecutor(3) as pool:
    external = list(pool.map(judge, outbound))

for b in broken:
    print(f"BROKEN  {b['status'] or b['error']}  {b['url']}")
for s in slow:
    print(f"SLOW    {s['ms'] / 1000:.1f} s  {s['url']}")
for e in external:
    if e["verdict"] != "working":
        print(f"{e['verdict'].upper():<7} {e['why']}  {e['url']}")
print(f"{len(crawl['data'])} checked: {len(broken)} broken, {len(slow)} slower than {slow_ms / 1000:g} s")
count = lambda v: sum(1 for x in external if x["verdict"] == v)  # noqa: E731
print(f"{len(external)} links to other sites: {count('working')} working, {count('broken')} broken, {count('blocked')} blocked")

out.mkdir(parents=True, exist_ok=True)
result = {"start": start, "slowMs": slow_ms, "checked": len(crawl["data"]), "broken": broken, "slow": slow, "pages": timed, "external": external}
(out / "result.json").write_text(json.dumps(result, indent=2, ensure_ascii=False))
