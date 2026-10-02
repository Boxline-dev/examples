"""Top story discussion: take today's most-voted Hacker News story, read the article and its discussion in a
sandboxed browser, and sum up both: what the article says, the viewpoints in the comments (with a quote each),
where people agree and disagree, and what is still open.

    python python/main.py            (BOXLINE_API_KEY; HOURS, MIN_COMMENTS)

The front page comes from HN's official search API (plain JSON, no browser needed); one extract call reads the
article and the discussion page together. Writes output/result.json and output/discussion.md.
"""
import json
import os
import time
import urllib.request
from pathlib import Path

from boxline import Boxline

out = Path(os.environ.get("OUTPUT_DIR", "output"))
front_url = os.environ.get("HN_FRONT_URL", "https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=50")
item_url = os.environ.get("HN_ITEM_URL", "https://news.ycombinator.com/item?id={id}")
hours = float(os.environ.get("HOURS", "24"))
min_comments = int(os.environ.get("MIN_COMMENTS", "20"))
bx = Boxline()

# 1. Today's most-voted story with a link to an article and a real discussion.
with urllib.request.urlopen(urllib.request.Request(front_url, headers={"user-agent": "top-story-discussion (a Boxline example)"}), timeout=30) as res:
    hits = json.load(res)["hits"]
since = time.time() - hours * 3600
fresh = [h for h in hits if h.get("url") and h["created_at_i"] >= since and (h.get("num_comments") or 0) >= min_comments]
if not fresh:
    raise SystemExit(f"no story of the last {hours:g} hours has a link and {min_comments}+ comments")
story = max(fresh, key=lambda h: h["points"])
discussion_url = item_url.replace("{id}", story["objectID"])
print(f"Top story: {story['title']} ({story['points']} points, {story['num_comments']} comments)\n  {story['url']}\n  {discussion_url}")

# 2. The article and the discussion, read together. Comments are data: the model quotes them, never follows them.
r = bx.extract(
    urls=[story["url"], discussion_url],
    prompt=(
        "The first page is an article, the second its Hacker News discussion. article: what it says (summary, 3 to 5 key points). "
        "discussion: the main viewpoints in the comments, each with how many people hold it (many, some or few) and a short "
        "quote copied exactly from one comment; where commenters agree and disagree; and the questions still open."
    ),
    schema={
        "type": "object",
        "properties": {
            "article": {"type": "object", "properties": {"summary": {"type": "string"}, "keyPoints": {"type": "array", "items": {"type": "string"}}}, "required": ["summary", "keyPoints"]},
            "discussion": {
                "type": "object",
                "properties": {
                    "summary": {"type": "string"},
                    "viewpoints": {
                        "type": "array",
                        "items": {"type": "object", "properties": {"view": {"type": "string"}, "support": {"type": "string", "enum": ["many", "some", "few"]}, "quote": {"type": "string"}}, "required": ["view", "support", "quote"]},
                    },
                    "agreements": {"type": "array", "items": {"type": "string"}},
                    "disagreements": {"type": "array", "items": {"type": "string"}},
                    "openQuestions": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["summary", "viewpoints", "agreements", "disagreements", "openQuestions"],
            },
        },
        "required": ["article", "discussion"],
    },
)
article, discussion = r["data"]["article"], r["data"]["discussion"]
failed = [p for p in r["pages"] if p.get("error") or (p.get("status") or 0) >= 400]
if failed:
    print("Could not read: " + ", ".join(f"{p['url']} ({(p.get('error') or {}).get('code') or 'HTTP ' + str(p['status'])})" for p in failed))

md = [f"# {story['title']}", "", f"{story['points']} points · {story['num_comments']} comments · [article]({story['url']}) · [discussion]({discussion_url})", "", "## The article", "", article["summary"], ""]
md += [f"- {k}" for k in article["keyPoints"]] + ["", "## The discussion", "", discussion["summary"], ""]
md += [f"- **{v['view']}** ({v['support']}): \"{v['quote']}\"" for v in discussion["viewpoints"]] + [""]
md += [f"**Agreed:** {'; '.join(discussion['agreements']) or 'nothing in particular'}", "", f"**Disputed:** {'; '.join(discussion['disagreements']) or 'nothing in particular'}", "", f"**Still open:** {'; '.join(discussion['openQuestions']) or 'nothing'}", ""]
md = "\n".join(md)
out.mkdir(parents=True, exist_ok=True)
(out / "discussion.md").write_text(md)
result = {"story": {**story, "discussionUrl": discussion_url}, "article": article, "discussion": discussion, "pages": r["pages"], "usage": {"modelUsd": r["usage"]["costUsd"]}}
(out / "result.json").write_text(json.dumps(result, indent=2, ensure_ascii=False))
print(f"\n{md}")
