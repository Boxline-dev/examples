"""Context pack: squeeze a few pages into a small, cited context for a model's prompt. Each source gets a tag ([S1],
[S2], …), a summary, its key facts (each carrying its tag, each backed by a quote checked against the page) and its
main links, and the pack is cut to a token budget, least important facts first.

    python python/main.py            (BOXLINE_API_KEY; URLS comma-separated, QUESTION to focus on, BUDGET in tokens)

Writes output/pack.md (paste it into a prompt), output/pack.json and output/result.json.
"""
import json
import math
import os
import re
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urlparse

from boxline import Boxline, BoxlineError

out = Path(os.environ.get("OUTPUT_DIR", "output"))
urls = [u.strip() for u in os.environ.get("URLS", "https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Caching,https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control").split(",") if u.strip()][:10]
question = os.environ.get("QUESTION", "")
budget = int(os.environ.get("BUDGET", "1500"))
bx = Boxline()


def tokens(s: str) -> int:
    return math.ceil(len(s) / 4)


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[*_`#>\[\]()\"“”'’]", " ", s.lower())).strip()


# 1. The pages' own text (to check quotes against) and their links.
def get(u):
    try:
        return bx.fetch(u, format="markdown", links=True)
    except BoxlineError as err:
        print(f"  skipped {u}: {err}")
        return None


with ThreadPoolExecutor(4) as pool:
    read = [p for p in pool.map(get, urls) if p and (p["status"] or 0) < 400]
if not read:
    raise SystemExit("no page could be read")

# 2. Summary and facts per source, in one call.
focus = f' for this question: "{question}"' if question else ""
r = bx.extract(
    urls=[p["finalUrl"] for p in read],
    prompt=(
        f"For each page: summary, two sentences; facts: the 5 to 8 facts that matter most{focus}, each one short "
        "sentence, with quote (words copied exactly from the page that state it) and importance (3 essential, 2 useful, 1 detail). url: the page's address as given."
    ),
    schema={
        "type": "object",
        "properties": {
            "sources": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "url": {"type": "string"},
                        "summary": {"type": "string"},
                        "facts": {"type": "array", "items": {"type": "object", "properties": {"fact": {"type": "string"}, "quote": {"type": "string"}, "importance": {"type": "integer", "enum": [1, 2, 3]}}, "required": ["fact", "quote", "importance"]}},
                    },
                    "required": ["url", "summary", "facts"],
                },
            }
        },
        "required": ["sources"],
    },
)

# 3. Tag the sources, keep only facts whose quote is on their page, and pick each page's main links.
unverified = 0
sources = []
for i, p in enumerate(read):
    got = next((s for s in r["data"]["sources"] if s["url"] in (p["finalUrl"], p["url"])), None) or (r["data"]["sources"][i] if i < len(r["data"]["sources"]) else None)
    text = norm(p["content"])
    facts = []
    for f in (got or {}).get("facts", []):
        if f["quote"].strip() and norm(f["quote"]) in text:
            facts.append(f)
        else:
            unverified += 1
    host = urlparse(p["finalUrl"]).netloc
    links = [l for l in p.get("links") or [] if urlparse(l).netloc == host and "#" not in l and l != p["finalUrl"]][:5]
    sources.append({"id": f"S{i + 1}", "url": p["finalUrl"], "title": p["title"], "summary": (got or {}).get("summary", ""), "facts": sorted(facts, key=lambda f: -f["importance"]), "links": links})


# 4. The pack, cut to the budget: details first, then useful facts, then links, from the last source back.
def render() -> str:
    lines = [f"# Context ({len(sources)} sources" + (f"; question: {question}" if question else "") + ")", "", "Cite facts with their tags. Sources:"]
    lines += [f"[{s['id']}] {s['title']} ({s['url']})" for s in sources] + [""]
    for s in sources:
        lines += [f"## [{s['id']}] {s['title']}", "", s["summary"], ""] + [f"- {f['fact']} [{s['id']}]" for f in s["facts"]]
        if s["links"]:
            lines += ["", "Links: " + " ".join(s["links"])]
        lines.append("")
    return "\n".join(lines)


dropped = 0
for level in (1, 2, "links", 3):
    for s in reversed(sources):
        while tokens(render()) > budget:
            if level == "links":
                if not s["links"]:
                    break
                s["links"].pop()
            else:
                idx = [k for k, f in enumerate(s["facts"]) if f["importance"] == level]
                if not idx or len(s["facts"]) <= 1:
                    break  # every source keeps at least its top fact
                s["facts"].pop(idx[-1])
                dropped += 1
pack = render()
kept = sum(len(s["facts"]) for s in sources)
print(f"{len(sources)} sources, {kept} facts kept ({unverified} without a quote on the page, {dropped} cut for the budget); {tokens(pack)} of {budget} tokens\n")
print(pack)
out.mkdir(parents=True, exist_ok=True)
(out / "pack.md").write_text(pack)
(out / "pack.json").write_text(json.dumps({"question": question or None, "sources": sources}, indent=2, ensure_ascii=False))
result = {"urls": urls, "question": question or None, "budget": budget, "tokens": tokens(pack), "sources": [{"id": s["id"], "url": s["url"], "facts": len(s["facts"])} for s in sources], "unverified": unverified, "dropped": dropped, "usage": {"modelUsd": r["usage"]["costUsd"]}}
(out / "result.json").write_text(json.dumps(result, indent=2, ensure_ascii=False))
