"""Search, read, answer: search the web, read the top results in a sandboxed browser, and answer with sources.

    python python/main.py            (BOXLINE_API_KEY; QUESTION for your own question)

Writes output/result.json: the search results, the answer and the pages it came from.
"""
import json
import os
from pathlib import Path

from boxline import Boxline

out = Path(os.environ.get("OUTPUT_DIR", "output"))
question = os.environ.get("QUESTION", "In what year was the Python programming language first released?")
bx = Boxline()

# 1. Search, and open the top 3 results as Markdown (in a real browser inside a sandbox, never on this computer).
#    The query goes to the search provider: keep passwords and personal data out of it.
found = bx.search(question, limit=5, fetch=3)
print(f"{len(found['results'])} results{' (from the cache)' if found['cached'] else ''}:")
for r in found["results"]:
    error = f" ({r['error']['code']})" if r.get("error") else ""
    print(f"  {'read' if r.get('content') else '    '}  {r['title']} ({r['url']}){error}")

# 2. Answer from the pages that loaded, with a schema so the answer and its sources come back as data.
read = [r["url"] for r in found["results"] if r.get("content")]
if not read:
    raise SystemExit("none of the top results could be opened; try another question")
answer = bx.extract(
    urls=read,
    prompt=f'Answer this question in one or two sentences, using only these pages: "{question}". '
    'In "sources", list the URLs of the pages the answer comes from.',
    schema={
        "type": "object",
        "properties": {"answer": {"type": "string"}, "sources": {"type": "array", "items": {"type": "string"}}},
        "required": ["answer", "sources"],
    },
)
data = answer["data"]
print(f"\n{data['answer']}\nSources:")
for s in data["sources"]:
    print(f"  - {s}")

out.mkdir(parents=True, exist_ok=True)
result = {
    "question": question,
    "results": [{"title": r["title"], "url": r["url"], "read": bool(r.get("content"))} for r in found["results"]],
    "answer": data["answer"],
    "sources": data["sources"],
    "model": answer["model"],
    "usage": {"modelUsd": answer["usage"]["costUsd"], "searches": 0 if found["cached"] else 1},
}
(out / "result.json").write_text(json.dumps(result, indent=2, ensure_ascii=False))
