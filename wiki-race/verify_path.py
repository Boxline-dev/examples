"""Runs in the session's shell: checks a Wikipedia race from the pages the browser really visited, with the MediaWiki
API, and works out whether a shorter route existed.

    python3 verify_path.py path.json      path.json: {"start": url, "target": title, "visited": [url, ...]}

- The route: the visited articles in order, with a return to an earlier article (Back) cutting off the dead end.
- Each hop A → B counts only when A's page links to B (redirects followed, as the browser does).
- Shortest: 1 when the start links to the target; 2 when one of the start's links links to it (found by intersecting
  the start's links with the target's backlinks); otherwise 3 or more.

Prints JSON. Requests carry a User-Agent naming this example, as Wikimedia's API etiquette asks."""
import json
import sys
from urllib.parse import unquote, urlparse

import requests

spec = json.load(open(sys.argv[1]))
host = urlparse(spec["start"]).netloc
API = f"https://{host}/w/api.php"
http = requests.Session()
http.headers["User-Agent"] = "BoxlineExamples/1.0 (https://github.com/Boxline-dev/examples; wiki-race)"
calls = 0


def query(**params):
    """Every page of a query's results (continuation followed)."""
    global calls
    params = {"action": "query", "format": "json", "formatversion": "2", **params}
    while True:
        calls += 1
        r = http.get(API, params=params, timeout=60).json()
        yield r.get("query", {})
        if "continue" not in r:
            return
        params.update(r["continue"])


def title_of(url):
    p = urlparse(url)
    if p.netloc != host or not p.path.startswith("/wiki/"):
        return None
    return unquote(p.path[len("/wiki/"):]).replace("_", " ")


def canonical(title):
    for q in query(titles=title, redirects=1):
        pages = q.get("pages", [])
        return pages[0]["title"] if pages and not pages[0].get("missing") else title
    return title


def links_of(title, namespace=None):
    out = set()
    extra = {"gplnamespace": namespace} if namespace is not None else {}
    for q in query(titles=title, generator="links", gpllimit="max", redirects=1, **extra):
        out.update(p["title"] for p in q.get("pages", []))
    return out


target = canonical(spec["target"])
route = []
for url in spec["visited"]:
    t = title_of(url)
    if not t:
        route.append({"title": None, "url": url})  # not an article of this wiki (a search page, another site)
        continue
    t = canonical(t)
    if route and route[-1]["title"] == t:
        continue
    seen = [i for i, r in enumerate(route) if r["title"] == t]
    if seen:
        route = route[: seen[-1] + 1]  # back to an earlier article: the dead end after it is not part of the route
        continue
    route.append({"title": t, "url": url})

hops = []
for a, b in zip(route, route[1:]):
    linked = bool(a["title"] and b["title"] and b["title"] in links_of(a["title"]))
    hops.append({"from": a["title"] or a["url"], "to": b["title"] or b["url"], "linked": linked})

start = route[0]["title"] if route else canonical(title_of(spec["start"]))
first = links_of(start, namespace=0)
if target in first:
    shortest = {"hops": 1, "via": []}
else:
    back = set()
    for q in query(list="backlinks", bltitle=target, blnamespace=0, bllimit="max", blredirect=1):
        for b in q.get("backlinks", []):
            back.add(b["title"])
            back.update(r["title"] for r in b.get("redirlinks", []))
        if len(back) > 50_000:
            break
    via = sorted(first & back)
    shortest = {"hops": 2, "via": via[:5]} if via else {"hops": 3, "via": [], "note": "3 or more"}

print(json.dumps({
    "start": start, "target": target, "route": [r["title"] or r["url"] for r in route], "hops": hops,
    "reached": bool(route) and route[-1]["title"] == target, "allLinked": all(h["linked"] for h in hops),
    "shortest": shortest, "apiCalls": calls,
}, ensure_ascii=False))
