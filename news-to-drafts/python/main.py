"""News to drafts: find what is new on the blogs or news pages you follow since the last run, read the new posts, and
write drafts for a person to review: a newsletter (Markdown and HTML) and one short social post per item, each with
its source link. Nothing is sent or posted.

    python python/main.py            (BOXLINE_API_KEY; SOURCES comma-separated index pages; RUNS, INTERVAL_SECONDS)

The posts already seen are kept in STATE_DIR. Writes output/newsletter.md, output/newsletter.html, output/posts.json
and output/result.json (the latest round's drafts).
"""
import hashlib
import html
import json
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin

from boxline import Boxline

out = Path(os.environ.get("OUTPUT_DIR", "output"))
state_dir = Path(os.environ.get("STATE_DIR", str(out / "state")))
sources = [u.strip() for u in os.environ.get("SOURCES", "https://github.blog/changelog/").split(",") if u.strip()][:10]
runs = int(os.environ.get("RUNS", "1"))
interval = int(os.environ.get("INTERVAL_SECONDS", "3600"))
max_items = int(os.environ.get("MAX_ITEMS", "8"))
bx = Boxline()

seen_file = state_dir / f"seen-{hashlib.sha256(','.join(sources).encode()).hexdigest()[:12]}.json"
state_dir.mkdir(parents=True, exist_ok=True)
out.mkdir(parents=True, exist_ok=True)

rounds, latest, model_usd = [], [], 0.0
for rnd in range(1, runs + 1):
    seen = set(json.loads(seen_file.read_text())) if seen_file.exists() else set()
    # 1. The posts listed on each index page (titles and addresses), in one call.
    lst = bx.extract(
        urls=sources,
        prompt="The posts (articles, entries) these pages list, newest first: title, the post's link as written, date when shown, and source: the address of the page that lists it (as given).",
        schema={"type": "object", "properties": {"posts": {"type": "array", "items": {"type": "object", "properties": {"title": {"type": "string"}, "url": {"type": "string"}, "date": {"type": ["string", "null"]}, "source": {"type": "string"}}, "required": ["title", "url", "date", "source"]}}}, "required": ["posts"]},
    )
    model_usd += lst["usage"]["costUsd"]
    # Links on index pages are often relative ("/blog/x"): resolved against the page that lists them.
    listed = [{**p, "url": urljoin(p["source"] if p["source"] in sources else sources[0], p["url"])} for p in lst["data"]["posts"]]
    fresh = [p for p in listed if re.match(r"^https?://", p["url"]) and p["url"] not in seen][:max_items]
    print(f"Round {rnd}: {len(lst['data']['posts'])} posts listed, {len(fresh)} new")
    # 2. The new posts themselves: a summary, why it matters, and a short post in plain words.
    items = []
    if fresh:
        r = bx.extract(
            urls=[p["url"] for p in fresh],
            prompt=(
                "For each page: title; summary, two plain sentences with its most concrete detail; takeaway, one sentence on who should care; "
                "post, a social post of at most 220 characters in plain words: no hype, no emoji, no hashtags, no link (it is added). url: the page's address as given."
            ),
            schema={"type": "object", "properties": {"items": {"type": "array", "items": {"type": "object", "properties": {"url": {"type": "string"}, "title": {"type": "string"}, "summary": {"type": "string"}, "takeaway": {"type": "string"}, "post": {"type": "string"}}, "required": ["url", "title", "summary", "takeaway", "post"]}}}, "required": ["items"]},
        )
        model_usd += r["usage"]["costUsd"]
        for i, it in enumerate(r["data"]["items"]):
            url = next((p["url"] for p in fresh if p["url"] == it["url"]), fresh[i]["url"] if i < len(fresh) else it["url"])
            items.append({**it, "url": url, "post": it["post"][:220].strip()})
    seen.update(p["url"] for p in fresh)
    seen_file.write_text(json.dumps(sorted(seen)))
    rounds.append({"round": rnd, "found": len(lst["data"]["posts"]), "fresh": [p["url"] for p in fresh]})

    # 3. The drafts. The newsletter is laid out here (not by the model), so every item keeps its own link.
    if items:
        day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        md = ["<!-- DRAFT: review before sending -->", f"# What's new ({day})", ""]
        for it in items:
            md += [f"## [{it['title']}]({it['url']})", "", it["summary"], "", f"*{it['takeaway']}*", ""]
        page = f"<!doctype html><meta charset=\"utf-8\"><title>What's new ({day})</title><!-- DRAFT: review before sending --><h1>What's new ({day})</h1>"
        page += "".join(f"<h2><a href=\"{html.escape(it['url'])}\">{html.escape(it['title'])}</a></h2><p>{html.escape(it['summary'])}</p><p><em>{html.escape(it['takeaway'])}</em></p>" for it in items)
        (out / "newsletter.md").write_text("\n".join(md))
        (out / "newsletter.html").write_text(page)
        (out / "posts.json").write_text(json.dumps([{"draft": True, "text": f"{it['post']} {it['url']}", "source": it["url"]} for it in items], indent=2, ensure_ascii=False))
        latest = items
        for it in items:
            print(f"  draft post: {it['post']} {it['url']}")
    print(f"Round {rnd} done: {len(items)} new items drafted.", flush=True)
    if rnd == 1:
        print("Seen posts saved.", flush=True)
    if rnd < runs:
        time.sleep(interval)

(out / "result.json").write_text(json.dumps({"sources": sources, "rounds": rounds, "items": latest, "usage": {"modelUsd": model_usd}}, indent=2, ensure_ascii=False))
