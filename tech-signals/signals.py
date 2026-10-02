"""Runs in the session's shell: collects Hacker News stories of the last WINDOW_HOURS with at least MIN_POINTS points
(HN's official search API, page by page), finds the themes several stories share, and writes /workspace/signals.json:
the top TOP themes, each with its stories, strongest first. Inputs: HN_SEARCH_URL, WINDOW_HOURS, MIN_POINTS, TOP, and
SPECIFICITY: a theme's term must be rarer than this in everyday English (wordfreq's Zipf scale: "data" 5.6, "kernel"
3.6, "webgpu" 0), so common words do not make themes. The session's setup installs wordfreq."""
import json
import math
import os
import re
import time
import urllib.parse
import urllib.request

base = os.environ.get("HN_SEARCH_URL", "https://hn.algolia.com/api/v1/search_by_date")
window = float(os.environ.get("WINDOW_HOURS", "48"))
min_points = int(os.environ.get("MIN_POINTS", "50"))
top = int(os.environ.get("TOP", "3"))
specificity = float(os.environ.get("SPECIFICITY", "4.5"))
try:
    from wordfreq import zipf_frequency
except ImportError:  # without wordfreq only the stop words below keep common words out
    def zipf_frequency(word, lang):
        return 0.0
since = int(time.time() - window * 3600)

STOP = set("""a about after all also an and any are as at be been but by can could did do does for from had has have how
i if in into is it its just like make more most my new no not now of on one or our out over show ask tell hn so some than
that the their them then there these they this to too up us use using via was we what when where which who why will with
would you your yours vs year years day days week first last get got way ways all only own still back every""".split())

stories, page = [], 0
while page < 10:
    q = urllib.parse.urlencode({"tags": "story", "numericFilters": f"created_at_i>{since},points>={min_points}", "hitsPerPage": 100, "page": page})
    req = urllib.request.Request(f"{base}?{q}", headers={"user-agent": "tech-signals (a Boxline example)"})
    with urllib.request.urlopen(req, timeout=30) as r:
        data = json.load(r)
    for h in data.get("hits", []):
        if h.get("title"):
            stories.append({"id": h["objectID"], "title": h["title"], "url": h.get("url") or f"https://news.ycombinator.com/item?id={h['objectID']}", "points": h.get("points") or 0, "comments": h.get("num_comments") or 0, "at": h.get("created_at_i")})
    page += 1
    if page >= data.get("nbPages", 1):
        break


def norm(w):
    w = w.strip(".-")
    return w[:-1] if w.endswith("s") and not w.endswith("ss") and len(w) > 4 else w  # agents → agent


def terms(title):
    words = {norm(w) for w in re.findall(r"[a-z][a-z0-9+#.-]{2,}", title.lower())}
    return {w for w in words if len(w) > 2 and w not in STOP and zipf_frequency(w, "en") < specificity}


# A theme: a term at least two stories share. Terms with the very same stories are one theme ("rust" + "kernel").
by_term = {}
for s in stories:
    for t in terms(s["title"]):
        by_term.setdefault(t, set()).add(s["id"])
groups = {}
for t, ids in by_term.items():
    if len(ids) >= 2:
        groups.setdefault(frozenset(ids), []).append(t)
weight = {s["id"]: math.log1p(s["points"]) + 0.5 * math.log1p(s["comments"]) for s in stories}
ranked = sorted(groups.items(), key=lambda g: -sum(weight[i] for i in g[0]))

themes, used = [], set()
for ids, words in ranked:
    if len(themes) >= top:
        break
    if ids & used:  # a story belongs to one theme: the strongest
        continue
    used |= ids
    members = sorted((s for s in stories if s["id"] in ids), key=lambda s: -s["points"])
    themes.append({"label": " ".join(sorted(words)), "score": round(sum(weight[i] for i in ids), 2), "stories": members})

json.dump({"collected": len(stories), "windowHours": window, "themes": themes}, open("/workspace/signals.json", "w"), indent=1)
print(f"{len(stories)} stories in {window:g} h; {len(groups)} shared terms; top themes:")
for t in themes:
    print(f"  {t['score']:6.2f}  {t['label']}  ({len(t['stories'])} stories)")
