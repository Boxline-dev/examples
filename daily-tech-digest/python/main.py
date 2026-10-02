"""Daily tech digest: collect today's stories from Hacker News and a few blogs, keep the ones on your topics, rank
them, read the top ones in a sandboxed browser and summarise them, then make a Markdown digest and a PDF slide deck
and post the digest to your chat.

    python python/main.py            (BOXLINE_API_KEY; a plan with shell sessions; INCLUDE, FEEDS, TOP, SLACK_WEBHOOK_URL)

The machine does the plumbing: collect.py gathers the stories in the session's shell (Hacker News' official search
API and the feeds), and deck.py builds the PDF there with fpdf2 (installed by the session's setup). One extract
call reads the top stories' pages. Writes output/result.json, output/digest.md and output/deck.pdf.
"""
import json
import math
import os
import re
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

from boxline import Boxline

here = Path(__file__).resolve().parent
out = Path(os.environ.get("OUTPUT_DIR", "output"))
hn_url = os.environ.get("HN_URL", "https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=50")
feeds = os.environ.get("FEEDS", "https://github.blog/feed/,https://aws.amazon.com/blogs/aws/feed/")


def words(v):
    return [w.strip().lower() for w in (v or "").split(",") if w.strip()]


include = words(os.environ.get("INCLUDE", "ai,llm,agent,agents,browser,security,database,open source"))
exclude = words(os.environ.get("EXCLUDE"))
top = min(int(os.environ.get("TOP", "5")), 10)  # one extract call reads at most 10 pages
max_age_hours = float(os.environ.get("MAX_AGE_HOURS", "48"))
chat_hook = os.environ.get("SLACK_WEBHOOK_URL")
bx = Boxline()


def hits(title, wordlist):
    return [w for w in wordlist if re.search(rf"\b{re.escape(w)}\b", title, re.I)]


def key(u):
    return re.sub(r"[#?].*$", "", u or "").rstrip("/")


with bx.sessions.create(browser=False, shell=True, setup=["pip install -q fpdf2"], timeout=900, idle_timeout=300, user_metadata={"example": "daily-tech-digest"}) as session:
    print(f"Session: {session.id}", flush=True)
    # 1. Collect on the machine: the scripts go into /workspace, the sources' addresses in as environment variables.
    session.files.write("collect.py", (here.parent / "collect.py").read_bytes())
    session.files.write("deck.py", (here.parent / "deck.py").read_bytes())
    c = session.exec("python collect.py", env={"HN_URL": hn_url, "FEEDS": feeds}, timeout_ms=120_000)
    if c["exitCode"] != 0:
        raise SystemExit(f"collect.py failed: {c['stderr'].strip()}")
    print(c["stdout"].strip())
    collected = json.loads(session.files.read_text("items.json"))

    # 2. Keep the fresh ones on your topics, then rank: points per hour and comments for Hacker News, a steady score
    #    for blogs (their posts are chosen by their editors), plus each topic word the title matches.
    now = collected["collectedAt"]
    seen, kept = set(), []
    for i in collected["items"]:
        if i["url"] in seen:
            continue
        seen.add(i["url"])
        if (include and not hits(i["title"], include)) or hits(i["title"], exclude):
            continue
        if i["at"] is not None and (now - i["at"]) / 3600 > max_age_hours:
            continue
        hours = max((now - (i["at"] or now)) / 3600, 1)
        base = 2 * math.log10(1 + i["points"] / hours) + math.log10(1 + i["comments"]) if i["source"] == "hn" else 2.5 - min(hours / 48, 1)
        kept.append({**i, "score": round(base + 0.5 * len(hits(i["title"], include)), 2)})
    kept.sort(key=lambda i: -i["score"])
    chosen = kept[:top]
    print(f"{len(collected['items'])} collected, {len(kept)} on your topics; the top {len(chosen)}:")
    for i in chosen:
        print(f"  {i['score']:.2f}  {i['title']}  ({str(i['points']) + ' points' if i['source'] == 'hn' else urlparse(i['url']).netloc})")
    if not chosen:
        raise SystemExit("nothing matched your topics; widen INCLUDE or add FEEDS")

    # 3. Read the chosen pages and summarise them in one call (a page that does not load is listed with an error).
    r = bx.extract(
        urls=[i["url"] for i in chosen],
        prompt="For each page: summary, two sentences on what it says, with its most concrete fact or number; whyItMatters, one sentence for an engineer. url: the page's address as given.",
        schema={
            "type": "object",
            "properties": {
                "stories": {
                    "type": "array",
                    "items": {"type": "object", "properties": {"url": {"type": "string"}, "summary": {"type": "string"}, "whyItMatters": {"type": "string"}}, "required": ["url", "summary", "whyItMatters"]},
                }
            },
            "required": ["stories"],
        },
    )
    by_url = {key(s["url"]): s for s in r["data"]["stories"]}
    every = []
    for n, i in enumerate(chosen):
        page = r["pages"][n] if n < len(r["pages"]) else {}
        # A page that did not load, or answered with an error (a 503 page is not the article), is not summarised.
        why = page["error"]["code"] if page.get("error") else f"HTTP {page['status']}" if page.get("status") is not None and page["status"] >= 400 else None
        s = None if why else (by_url.get(key(i["url"])) or by_url.get(key(page.get("finalUrl"))))
        every.append({
            "title": i["title"],
            "url": i["url"],
            "where": f"Hacker News · {i['points']} points · {i['comments']} comments" if i["source"] == "hn" else urlparse(i["url"]).netloc,
            "read": bool(s),
            "summary": s["summary"] if s else f"The page could not be read ({why or 'no summary'}).",
            "whyItMatters": s["whyItMatters"] if s else "",
            "score": i["score"],
        })
    stories = [x for x in every if x["read"]]
    unread = [x for x in every if not x["read"]]
    if not stories:
        raise SystemExit("none of the top pages could be read: " + "; ".join(f"{x['url']} ({x['summary']})" for x in unread))

    # 4. The digest: Markdown here, a PDF deck built in the shell, and a chat post.
    day = datetime.fromtimestamp(now, timezone.utc).strftime("%Y-%m-%d")
    digest = {"title": f"Tech digest, {day}", "subtitle": f"{len(stories)} stories from {len(collected['items'])} collected ({', '.join(include)})", "stories": stories}
    md = [f"# {digest['title']}", "", digest["subtitle"], ""]
    for n, s in enumerate(stories, 1):
        md += [f"## {n}. [{s['title']}]({s['url']})", "", f"*{s['where']}*", "", s["summary"], "", f"**Why it matters:** {s['whyItMatters']}", ""]
    if unread:
        md += ["## Could not be read", ""] + [f"- [{s['title']}]({s['url']}): {s['summary']}" for s in unread] + [""]
    md = "\n".join(md)
    session.files.write("digest.json", json.dumps(digest))
    deck = session.exec("python deck.py", timeout_ms=120_000)
    if deck["exitCode"] != 0:
        raise SystemExit(f"deck.py failed: {deck['stderr'].strip()}")
    print(deck["stdout"].strip())
    out.mkdir(parents=True, exist_ok=True)
    (out / "deck.pdf").write_bytes(session.files.read("deck.pdf"))
    (out / "digest.md").write_text(md)

    alerts_sent = 0
    if chat_hook:
        text = f"*{digest['title']}*\n\n" + "\n\n".join(f"{n}. <{s['url']}|{s['title']}>\n{s['summary']}" for n, s in enumerate(stories, 1))
        req = urllib.request.Request(chat_hook, data=json.dumps({"text": text}).encode(), headers={"content-type": "application/json"}, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=30):
                alerts_sent = 1
                print("Posted the digest to the chat webhook.")
        except Exception as err:
            print(f"The chat webhook failed: {err}")
    result = {"collected": len(collected["items"]), "sourceErrors": collected["errors"], "kept": len(kept), "stories": stories, "unread": unread, "pages": r["pages"], "alertsSent": alerts_sent, "usage": {"modelUsd": r["usage"]["costUsd"]}}
    (out / "result.json").write_text(json.dumps(result, indent=2, ensure_ascii=False))
    print(f"\n{md}")
