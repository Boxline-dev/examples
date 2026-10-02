"""Site map: crawl a site and draw its page tree, list its heaviest pages and broken links, and find its orphans: pages
the site's sitemap.xml lists but no crawled page links to (a crawler alone can never find those).

    python python/main.py            (BOXLINE_API_KEY; SITE_URL, MAX_PAGES, MAX_DEPTH; SITEMAP_URL to override)

The crawl respects robots.txt and crawl-delay. Writes output/result.json and output/sitemap.md.
"""
import json
import os
import re
import urllib.request
from pathlib import Path
from urllib.parse import urljoin, urlparse

from boxline import Boxline

out = Path(os.environ.get("OUTPUT_DIR", "output"))
start = os.environ.get("SITE_URL", "https://quotes.toscrape.com/")
sitemap_url = os.environ.get("SITEMAP_URL") or urljoin(start, "/sitemap.xml")
max_pages = int(os.environ.get("MAX_PAGES", "30"))
max_depth = int(os.environ.get("MAX_DEPTH", "3"))
bx = Boxline()


def path(u: str) -> str:
    x = urlparse(u)
    return (re.sub(r"/index\.html?$", "/", x.path) or "/") + (f"?{x.query}" if x.query else "")


# 1. Crawl as HTML, so each page's links can be read (same host, breadth-first).
job = bx.crawl.start(start, max_pages=max_pages, max_depth=max_depth, format="html")
print(f"Crawling {start} (up to {max_pages} pages, depth {max_depth}): {job['id']}")
done = bx.crawl.wait(job["id"], poll=1.5, timeout=600)
print(f"{done['status']}: {done['pagesDone']} pages, {done['pagesFailed']} failed, {done['skippedByRobots']} skipped by robots.txt")

# 2. Links, sizes and the tree (each page under the first page that linked to it).
host = urlparse(start).netloc
pages = {}
for p in done["data"]:
    at = p.get("finalUrl") or p["url"]
    links = set()
    for href in re.findall(r"""<a\s[^>]*href\s*=\s*["']([^"'#]+)["']""", p.get("content") or "", re.I):
        u = urlparse(urljoin(at, href))
        if u.scheme in ("http", "https") and u.netloc == host:
            links.add(path(u.geturl()))
    pages[path(at)] = {"title": p.get("title"), "status": p.get("status"), "bytes": len((p.get("content") or "").encode()), "depth": p["depth"], "links": links}

parent = {}
for frm, meta in sorted(pages.items(), key=lambda kv: kv[1]["depth"]):
    for to in meta["links"]:
        if to in pages and to != frm and to not in parent and to != path(start):
            parent[to] = frm
tree = []


def draw(p: str, indent: str) -> None:
    m = pages[p]
    bad = f"  [{m['status']}]" if (m["status"] or 0) >= 400 else ""
    tree.append(f"{indent}{p}  {m['title'] or ''}{bad}")
    for child, frm in parent.items():
        if frm == p:
            draw(child, indent + "  ")


draw(path(start), "")

# 3. Orphans: in the sitemap, never linked from a crawled page. Broken: linked, and answered 400 or more.
listed = []
try:
    with urllib.request.urlopen(sitemap_url, timeout=30) as res:
        listed = [path(m) for m in re.findall(r"<loc>\s*([^<\s]+)\s*</loc>", res.read().decode("utf-8", "replace"))]
except Exception:
    pass  # no sitemap: no orphans can be found
linked = {link for m in pages.values() for link in m["links"]}
orphans = [p for p in listed if p not in linked and p != path(start)]
broken = [{"path": p, "status": m["status"], "linkedFrom": [q for q, x in pages.items() if p in x["links"]]} for p, m in pages.items() if (m["status"] or 0) >= 400]
heaviest = [{"path": p, "kb": round(m["bytes"] / 1024, 1)} for p, m in sorted(pages.items(), key=lambda kv: -kv[1]["bytes"])[:10]]

print("\n" + "\n".join(tree))
print(f"\nOrphans (in {'the sitemap' if listed else 'no sitemap'}, never linked): {', '.join(orphans) or 'none'}")
print("Broken links: " + ("; ".join(f"{b['path']} ({b['status']}, from {', '.join(b['linkedFrom'])})" for b in broken) or "none"))
print("Heaviest: " + ", ".join(f"{h['path']} {h['kb']} KB" for h in heaviest[:5]))

md = [f"# {start}", "", f"{len(pages)} pages crawled (depth {max_depth}); sitemap: {f'{len(listed)} addresses' if listed else 'none found'}.", "", "## Pages", "", "```", *tree, "```", ""]
md += ["## Orphans", "", "\n".join(f"- {o}" for o in orphans) or "None.", ""]
md += ["## Broken links", "", "\n".join(f"- {b['path']} ({b['status']}), linked from {', '.join(b['linkedFrom'])}" for b in broken) or "None.", ""]
md += ["## Heaviest pages", "", "\n".join(f"- {h['path']}: {h['kb']} KB" for h in heaviest), ""]
out.mkdir(parents=True, exist_ok=True)
(out / "sitemap.md").write_text("\n".join(md))
result = {
    "start": start,
    "crawlId": job["id"],
    "status": done["status"],
    "pages": [{"path": p, "title": m["title"], "status": m["status"], "kb": round(m["bytes"] / 1024, 1), "depth": m["depth"], "parent": parent.get(p), "links": sorted(m["links"])} for p, m in pages.items()],
    "sitemap": listed,
    "orphans": orphans,
    "broken": broken,
    "heaviest": heaviest,
}
(out / "result.json").write_text(json.dumps(result, indent=2, ensure_ascii=False))
