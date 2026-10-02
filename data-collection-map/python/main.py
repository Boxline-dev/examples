"""Data collection map: what personal data a site's pages ask for and where it goes. For each page: its forms, the
kinds of personal data their fields collect (email, phone, birth date, card, …) and where each form sends it (this
site or another); and across the visit, the third-party hosts the pages load from (known trackers marked) and the
cookies the site sets. A starting point for a privacy review of your own site.

    python python/main.py            (BOXLINE_API_KEY; SITE_URL, MAX_PAGES, TRACKERS to add host names)

forms.js runs in each page; the network log and the cookie export come from the session. Writes output/result.json
and output/map.md.
"""
import json
import os
import time
from collections import Counter
from pathlib import Path
from urllib.parse import urldefrag, urlparse

from boxline import Boxline, BoxlineError

here = Path(__file__).resolve().parent
out = Path(os.environ.get("OUTPUT_DIR", "output"))
start = os.environ.get("SITE_URL", "https://books.toscrape.com/")
max_pages = int(os.environ.get("MAX_PAGES", "5"))
forms_js = (here.parent / "forms.js").read_text()
TRACKERS = ["google-analytics.com", "googletagmanager.com", "doubleclick.net", "facebook.net", "facebook.com", "connect.facebook.net", "segment.io", "segment.com", "hotjar.com", "mixpanel.com", "amplitude.com", "clarity.ms", "tiktok.com", "linkedin.com", "bing.com", "criteo.com", "taboola.com", "hubspot.com"]
TRACKERS += [t.strip() for t in os.environ.get("TRACKERS", "").split(",") if t.strip()]
bx = Boxline()


def site(host: str) -> str:
    return ".".join(host.split(".")[-2:])


mine = site(urlparse(start).hostname or "")
pages, cookies, requests = [], [], []
with bx.sessions.create(timeout=300, user_metadata={"example": "data-collection-map"}) as session:
    print(f"Session: {session.id}", flush=True)
    # 1. The start page and the pages it links to on the same site, one after the other in the same browser.
    queue, seen = [start], set()
    while queue and len(pages) < max_pages:
        url = queue.pop(0)
        if url in seen:
            continue
        seen.add(url)
        try:
            opened = session.goto(url, wait_until="load")
        except BoxlineError:
            continue
        if (opened["status"] or 0) >= 400:
            continue
        found = session.evaluate(forms_js)
        pages.append({"url": opened["url"], "title": opened["title"], "forms": [{**f, "sendsTo": urlparse(f["action"]).netloc, "thirdParty": site(urlparse(f["action"]).hostname or "") != mine} for f in found]})
        for link in session.evaluate("[...document.links].map((a) => a.href).filter((h) => /^https?:/.test(h))"):
            u = urldefrag(link).url
            if site(urlparse(u).hostname or "") == mine and u not in seen:
                queue.append(u)

    # 2. Everything the pages loaded (the session's network log) and the cookies they left.
    time.sleep(1.5)
    hosts = Counter()
    for e in session.events(types=["network"], limit=2000):
        h = urlparse(e.get("url") or "").hostname
        if h and site(h) != mine:
            hosts[h] += 1
    requests = sorted(({"host": h, "tracker": any(h == t or h.endswith(f".{t}") for t in TRACKERS), "requests": n} for h, n in hosts.items()), key=lambda r: -r["requests"])
    # The cookie jar as a Netscape cookie file (the format curl and wget read): one tab-separated line per cookie.
    exported = session.export_cookies()
    for line in session.files.read_text(exported["path"]).split("\n"):
        if not line.strip() or (line.startswith("#") and not line.startswith("#HttpOnly_")):
            continue
        domain, _, _, secure, _, name = line.split("\t")[:6]
        host = domain.removeprefix("#HttpOnly_").lstrip(".")
        cookies.append({"name": name, "domain": host, "httpOnly": domain.startswith("#HttpOnly_"), "secure": secure == "TRUE", "thirdParty": site(host) != mine})

collected = sorted({k for p in pages for f in p["forms"] for k in f["kinds"]})
offsite = [{"page": p["url"], "sendsTo": f["sendsTo"], "kinds": f["kinds"]} for p in pages for f in p["forms"] if f["thirdParty"] and f["kinds"]]
print(f"{len(pages)} pages; personal data asked for: {', '.join(collected) or 'none'}")
for p in pages:
    for f in p["forms"]:
        print(f"  {p['url']}\n    form → {f['method'].upper()} {f['sendsTo']}{' (another site)' if f['thirdParty'] else ''}: {', '.join(f['kinds']) or 'no personal data'}")
print("Third-party hosts: " + (", ".join(f"{r['host']}{' (tracker)' if r['tracker'] else ''}" for r in requests) or "none"))
print("Cookies: " + (", ".join(f"{c['name']} ({c['domain']}{', HttpOnly' if c['httpOnly'] else ''})" for c in cookies) or "none"))

md = [f"# Data collection map: {start}", "", f"Personal data asked for: {', '.join(collected) or 'none'}."]
if offsite:
    md += ["", "**Sent to another site:** " + "; ".join(f"{', '.join(o['kinds'])} → {o['sendsTo']} (from {o['page']})" for o in offsite)]
md += ["", "## Pages and forms", ""]
for p in pages:
    md.append(f"- {p['url']}")
    for f in p["forms"]:
        fields = ", ".join(f"{x['label'] or x['name']}" + (f" [{x['kind']}]" if x["kind"] else "") for x in f["fields"] if x["type"] != "hidden")
        md.append(f"  - form → {f['method'].upper()} {f['sendsTo']}{' **(another site)**' if f['thirdParty'] else ''}: {fields}")
md += ["", "## Third-party hosts", ""] + ([f"- {r['host']}: {r['requests']} requests" + (" (known tracker)" if r["tracker"] else "") for r in requests] or ["None."])
md += ["", "## Cookies", ""] + ([f"- {c['name']} ({c['domain']}): {'HttpOnly' if c['httpOnly'] else 'readable by scripts'}, {'Secure' if c['secure'] else 'not Secure'}" + (", third party" if c["thirdParty"] else "") for c in cookies] or ["None."]) + [""]
out.mkdir(parents=True, exist_ok=True)
(out / "map.md").write_text("\n".join(md))
(out / "result.json").write_text(json.dumps({"start": start, "pages": pages, "collected": collected, "offsite": offsite, "thirdParties": requests, "cookies": cookies}, indent=2, ensure_ascii=False))
