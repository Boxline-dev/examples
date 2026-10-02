"""Pages to dataset: turn web pages into a dataset for fine-tuning or evaluation: clean text passages (boilerplate and
near-duplicates removed) and question-answer pairs whose evidence is checked against the page, split into train
and eval sets in JSONL. The pages come from a list of addresses, or from a web search.

    python python/main.py            (BOXLINE_API_KEY; URLS comma-separated, or QUERY; CHUNK_TOKENS, QA_PER_PAGE, EVAL_SHARE)

Use pages you may reuse this way (your own docs, openly licensed content). Writes output/train.jsonl,
output/eval.jsonl and output/result.json.
"""
import hashlib
import json
import math
import os
import re
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from boxline import Boxline, BoxlineError

out = Path(os.environ.get("OUTPUT_DIR", "output"))
urls = [u.strip() for u in os.environ.get("URLS", "").split(",") if u.strip()]
query = os.environ.get("QUERY") or ("" if urls else "how do vector databases index embeddings")
chunk_tokens = int(os.environ.get("CHUNK_TOKENS", "200"))
qa_per_page = int(os.environ.get("QA_PER_PAGE", "3"))
eval_share = float(os.environ.get("EVAL_SHARE", "0.2"))
bx = Boxline()

LINK = re.compile(r"!?\[([^\]]*)\]\([^)]*\)")


def tokens(s: str) -> int:
    return math.ceil(len(s) / 4)


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[*_`#>\[\]()]", " ", s.lower())).strip()


def is_link_list(block: str) -> bool:
    links = LINK.findall(block)
    if len(links) < 3:
        return False
    visible = len(re.sub(r"\s+", "", re.sub(r"[*_#>`|-]", "", LINK.sub(r"\1", block))))
    return visible == 0 or sum(len(re.sub(r"\s+", "", t)) for t in links) / visible >= 0.7


# 1. Collect: the search's top pages come back as Markdown with the results; listed addresses are fetched, 3 at a time.
pages, searches = [], 0
if query:
    found = bx.search(query, limit=5, fetch=5)
    searches = 0 if found["cached"] else 1
    pages = [{"url": (r.get("page") or {}).get("finalUrl") or r["url"], "title": r["title"], "text": r["content"]} for r in found["results"] if r.get("content")]
    print(f'Search "{query}": {len(found["results"])} results, {len(pages)} pages read')
else:
    def get(u):
        try:
            return bx.fetch(u, format="markdown")
        except BoxlineError as err:
            print(f"  skipped: {err}")
            return None

    with ThreadPoolExecutor(3) as pool:
        for f in pool.map(get, urls):
            if f and (f["status"] or 0) < 400:
                pages.append({"url": f["finalUrl"], "title": f["title"], "text": f["content"]})
    print(f"{len(pages)} of {len(urls)} pages read")
if not pages:
    raise SystemExit("no page could be read")

# 2. Clean: lines most pages repeat, navigation-like link lists, and what comes before each page's title go. A
#    paragraph sharing 80% or more of its 5-word shingles with one kept before is a near-duplicate and goes too.
seen = Counter()
for p in pages:
    seen.update({l.strip() for l in p["text"].split("\n") if len(l.strip()) > 3 and not l.strip().startswith("#")})
boilerplate = {l for l, n in seen.items() if n >= max(2, math.ceil(len(pages) * 0.6))} if len(pages) >= 3 else set()


def shingles(s: str) -> set:
    w = norm(s).split(" ")
    return {" ".join(w)} if len(w) < 5 else {" ".join(w[i : i + 5]) for i in range(len(w) - 4)}


kept_shingles = []


def near_duplicate(text: str) -> bool:
    sh = shingles(text)
    dup = any(len(sh & k) / len(sh | k) >= 0.8 for k in kept_shingles)
    if not dup:
        kept_shingles.append(sh)
    return dup


kept, duplicates = [], 0
for p in pages:
    blocks = re.split(r"\n\s*\n", p["text"])
    title_at = next((i for i, b in enumerate(blocks) if re.match(r"^#\s", b.strip())), -1)
    buf = []
    for block in blocks[title_at:] if title_at > 0 else blocks:
        text = "\n".join(l for l in block.split("\n") if l.strip() not in boilerplate).strip()
        if not text or is_link_list(text) or re.match(r"^#{1,6}\s", text) or len(text) < 40:
            continue  # headings and scraps alone are no passage
        if near_duplicate(text):
            duplicates += 1
            continue
        # 3. Passages: paragraphs of a page together, within the token budget.
        if tokens("\n\n".join([*buf, text])) > chunk_tokens and buf:
            kept.append({"url": p["url"], "title": p["title"], "text": "\n\n".join(buf)})
            buf = []
        buf.append(text[: chunk_tokens * 4])
    if buf:
        kept.append({"url": p["url"], "title": p["title"], "text": "\n\n".join(buf)})
print(f"{len(kept)} passages, {duplicates} near-duplicate paragraphs dropped, {len(boilerplate)} boilerplate lines removed")

# 4. Question-answer pairs, 10 pages per extract call; a pair whose evidence is not on its page is dropped.
pairs, unverified, model_usd = [], 0, 0.0
for i in range(0, len(pages) if qa_per_page > 0 else 0, 10):
    batch = pages[i : i + 10]
    r = bx.extract(
        urls=[p["url"] for p in batch],
        prompt=f"For each page, {qa_per_page} question-answer pairs a reader could answer from that page alone, about its most specific facts. evidence: one sentence copied exactly from the page that supports the answer. url: the page's address as given.",
        schema={"type": "object", "properties": {"pairs": {"type": "array", "items": {"type": "object", "properties": {"url": {"type": "string"}, "question": {"type": "string"}, "answer": {"type": "string"}, "evidence": {"type": "string"}}, "required": ["url", "question", "answer", "evidence"]}}}, "required": ["pairs"]},
    )
    model_usd += r["usage"]["costUsd"]
    for q in r["data"]["pairs"]:
        page = next((p for p in batch if p["url"] == q["url"]), None) or next((p for p in batch if norm(q["evidence"]) in norm(p["text"])), None)
        if page and norm(q["evidence"]) in norm(page["text"]):
            pairs.append({**q, "url": page["url"]})
        else:
            unverified += 1
print(f"{len(pairs)} question-answer pairs kept, {unverified} dropped (their evidence is not on the page)")


# 5. Records, split by a hash of their id (the same record always lands in the same set).
def rid(s: str) -> str:
    return hashlib.sha256(s.encode()).hexdigest()[:12]


records = [{"id": rid(f"text:{p['url']}:{p['text']}"), "type": "text", "url": p["url"], "title": p["title"], "text": p["text"], "tokens": tokens(p["text"])} for p in kept]
records += [{"id": rid(f"qa:{q['url']}:{q['question']}"), "type": "qa", "url": q["url"], "question": q["question"], "answer": q["answer"], "evidence": q["evidence"]} for q in pairs]
in_eval = [int(r["id"][:8], 16) / 0xFFFFFFFF < eval_share for r in records]
train = [r for r, e in zip(records, in_eval) if not e]
eval_set = [r for r, e in zip(records, in_eval) if e]
if not eval_set and len(records) > 1 and eval_share > 0:
    eval_set, train = train[:1], train[1:]  # at least one to evaluate on
out.mkdir(parents=True, exist_ok=True)
(out / "train.jsonl").write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in train))
(out / "eval.jsonl").write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in eval_set))
result = {"query": query or None, "urls": urls, "pages": [p["url"] for p in pages], "passages": len(kept), "duplicates": duplicates, "boilerplate": len(boilerplate), "pairs": len(pairs), "unverified": unverified, "train": len(train), "eval": len(eval_set), "usage": {"modelUsd": model_usd, "searches": searches}}
(out / "result.json").write_text(json.dumps(result, indent=2, ensure_ascii=False))
print(f"train.jsonl: {len(train)} records, eval.jsonl: {len(eval_set)}")
for q in pairs[:3]:
    print(f"  Q: {q['question']}\n  A: {q['answer']}")
