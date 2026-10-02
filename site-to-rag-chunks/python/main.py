"""Site to RAG chunks: crawl a site (or one page) and turn it into chunks ready for an embedding pipeline: boilerplate
found across pages (navigation, footers, cookie notes: lines most pages repeat) removed, each page cut at its
headings, then into chunks within a token budget, each with its heading path and a ready-to-embed text.

    python python/main.py            (BOXLINE_API_KEY; SITE_URL, MAX_PAGES, MAX_TOKENS)

No model is used. The crawl respects robots.txt. Writes output/chunks.jsonl and output/result.json.
"""
import json
import math
import os
import re
from collections import Counter
from pathlib import Path
from urllib.parse import urlparse

from boxline import Boxline

out = Path(os.environ.get("OUTPUT_DIR", "output"))
start = os.environ.get("SITE_URL", "https://playwright.dev/docs/intro")
max_pages = int(os.environ.get("MAX_PAGES", "10"))
max_tokens = int(os.environ.get("MAX_TOKENS", "300"))
bx = Boxline()


def tokens(s: str) -> int:
    return math.ceil(len(s) / 4)  # a rough count (about 4 characters per token in English)


def is_heading(line: str) -> bool:
    return re.match(r"^#{1,6}\s", line) is not None


LINK = re.compile(r"!?\[([^\]]*)\]\([^)]*\)")


def is_link_list(block: str) -> bool:
    """Navigation, not content: a block of 3 or more links where links make up 70% or more of the visible text."""
    links = LINK.findall(block)
    if len(links) < 3:
        return False
    visible = len(re.sub(r"\s+", "", re.sub(r"[*_#>`|-]", "", LINK.sub(r"\1", block))))
    linked = sum(len(re.sub(r"\s+", "", t)) for t in links)
    return visible == 0 or linked / visible >= 0.7


# 1. The pages, as Markdown (same host, breadth-first).
job = bx.crawl.start(start, max_pages=max_pages, max_depth=2, format="markdown")
done = bx.crawl.wait(job["id"], poll=1.5, timeout=600)
pages = [p for p in done["data"] if p.get("content") and not p.get("error") and (p.get("status") or 0) < 400]
print(f"Crawled {start}: {len(pages)} pages to chunk ({done['pagesFailed']} failed, {done['skippedByRobots']} skipped by robots.txt)")

# 2. Boilerplate: a line (not a heading) that most pages repeat.
seen_on = Counter()
for p in pages:
    seen_on.update({l.strip() for l in p["content"].split("\n") if len(l.strip()) > 3 and not is_heading(l.strip())})
boilerplate = {l for l, n in seen_on.items() if n >= max(2, math.ceil(len(pages) * 0.6))} if len(pages) >= 3 else set()
print(f"{len(boilerplate)} boilerplate lines removed" + (f', e.g. "{next(iter(boilerplate))[:60]}"' if boilerplate else ""))

# 3. Sections at headings, then chunks within the budget (paragraphs kept whole when they fit, else cut at sentences).
chunks = []
for p in pages:
    url = p.get("finalUrl") or p["url"]
    title = p.get("title") or url
    slug = re.sub(r"[^a-z0-9]+", "-", urlparse(url).path, flags=re.I).strip("-") or "index"
    stack, paragraphs, n = [], [], 0

    def flush():
        global n
        buf = []

        def emit():
            global n
            text = "\n\n".join(buf).strip()
            if not text:
                return
            n += 1
            headings = [h for h in stack if h]
            chunks.append({"id": f"{slug}-{n}", "url": url, "title": title, "headings": headings, "text": text, "tokens": tokens(text), "embedText": " > ".join([title, *headings]) + f"\n\n{text}"})
            buf.clear()

        for para in paragraphs:
            pieces = [para] if tokens(para) <= max_tokens else [s.strip() for s in re.findall(r"[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$", para)] or [para]
            for piece in pieces:
                if tokens("\n\n".join([*buf, piece])) > max_tokens:
                    emit()
                buf.append(piece[: max_tokens * 4])
        emit()
        paragraphs.clear()

    # The page starts at its title when it has one (what comes before is the site's header and breadcrumbs).
    blocks = re.split(r"\n\s*\n", p["content"])
    title_at = next((i for i, b in enumerate(blocks) if re.match(r"^#\s", b.strip())), -1)
    for block in blocks[title_at:] if title_at > 0 else blocks:
        lines = [l for l in block.split("\n") if l.strip() not in boilerplate]
        if not "".join(lines).strip() or is_link_list("\n".join(lines)):
            continue
        if is_heading(lines[0].strip()):
            flush()
            level = len(re.match(r"^#+", lines[0].strip()).group(0))
            del stack[level - 1:]
            stack += [""] * (level - 1 - len(stack))  # a skipped level stays empty, then is left out
            stack.append(re.sub(r"^#+\s*", "", lines[0].strip()))
            rest = "\n".join(lines[1:]).strip()
            if rest:
                paragraphs.append(rest)
        else:
            paragraphs.append("\n".join(lines).strip())
    flush()

largest = max((c["tokens"] for c in chunks), default=0)
print(f"{len(chunks)} chunks of at most {max_tokens} tokens (largest {largest}) from {len(pages)} pages")
for c in chunks[:3]:
    print(f"  {c['id']}  [{' > '.join(c['headings'])}]  {c['text'][:80].replace(chr(10), ' ')}…")
out.mkdir(parents=True, exist_ok=True)
(out / "chunks.jsonl").write_text("".join(json.dumps(c, ensure_ascii=False) + "\n" for c in chunks))
result = {"start": start, "crawlId": job["id"], "pages": [p.get("finalUrl") or p["url"] for p in pages], "maxTokens": max_tokens, "chunks": len(chunks), "largest": largest, "boilerplate": sorted(boilerplate)}
(out / "result.json").write_text(json.dumps(result, indent=2, ensure_ascii=False))
