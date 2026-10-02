"""Runs in the session's shell: collects stories from Hacker News (its official search API) and RSS/Atom feeds into
/workspace/items.json. Inputs come as environment variables: HN_URL and FEEDS (comma-separated)."""
import json
import os
import time
import urllib.request
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime
from datetime import datetime

UA = {"user-agent": "daily-tech-digest (a Boxline example)"}


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
        return r.read()


def when(text):
    if not text:
        return None
    try:
        return int(parsedate_to_datetime(text).timestamp())  # RSS: RFC 822 dates
    except (TypeError, ValueError):
        pass
    try:
        return int(datetime.fromisoformat(text.replace("Z", "+00:00")).timestamp())  # Atom: ISO 8601
    except ValueError:
        return None


items, errors = [], []
hn = os.environ.get("HN_URL")
if hn:
    try:
        for h in json.loads(get(hn))["hits"]:
            link = h.get("url") or f"https://news.ycombinator.com/item?id={h['objectID']}"
            items.append({
                "source": "hn",
                "title": h["title"],
                "url": link,
                "discussion": f"https://news.ycombinator.com/item?id={h['objectID']}",
                "points": h.get("points") or 0,
                "comments": h.get("num_comments") or 0,
                "at": h.get("created_at_i"),
            })
    except Exception as e:  # one source failing does not stop the others
        errors.append(f"{hn}: {e}")

for feed in [f.strip() for f in os.environ.get("FEEDS", "").split(",") if f.strip()]:
    try:
        root = ET.fromstring(get(feed))
        atom = "{http://www.w3.org/2005/Atom}"
        entries = root.findall("./channel/item") or root.findall(f"{atom}entry")
        for e in entries[:20]:
            if e.tag == "item":
                title, link, at = e.findtext("title"), e.findtext("link"), when(e.findtext("pubDate"))
            else:
                title = e.findtext(f"{atom}title")
                node = e.find(f"{atom}link[@rel='alternate']") or e.find(f"{atom}link")
                link = node.get("href") if node is not None else None
                at = when(e.findtext(f"{atom}published") or e.findtext(f"{atom}updated"))
            if title and link:
                items.append({"source": "feed", "feed": feed, "title": title.strip(), "url": link.strip(), "points": 0, "comments": 0, "at": at})
    except Exception as e:
        errors.append(f"{feed}: {e}")

with open("/workspace/items.json", "w") as f:
    json.dump({"collectedAt": int(time.time()), "items": items, "errors": errors}, f, indent=1)
print(f"{len(items)} items, {len(errors)} sources failed")
for e in errors:
    print(f"  failed: {e}")
