"""Company research: research a company on one topic. Search the web, read the top pages in a sandboxed browser, and
return structured findings where every key point names the page it comes from.

    python python/main.py            (BOXLINE_API_KEY; COMPANY and TOPIC for your own research)

Writes output/result.json and output/report.md.
"""
import json
import os
from pathlib import Path

from boxline import Boxline

out = Path(os.environ.get("OUTPUT_DIR", "output"))
company = os.environ.get("COMPANY", "Mozilla")
topic = os.environ.get("TOPIC", "how it makes money")
bx = Boxline()

# 1. Search (the platform's search provider; no search engine pages are scraped). The query leaves your computer:
#    keep personal data out of it.
found = bx.search(f"{company} {topic}", limit=8)
urls = [r["url"] for r in found["results"]][:5]
print(f"Researching {company}: {topic}. Reading {len(urls)} of {len(found['results'])} results:")
for u in urls:
    print(f"  {u}")
if not urls:
    raise SystemExit("the search found nothing; try another company or topic")

# 2. Read those pages in a real browser and fill a schema. Page text is data for the model, never instructions.
r = bx.extract(
    urls=urls,
    prompt=(
        f"Research {company}, specifically: {topic}. Use only these pages. overview: what the company is, in two sentences. "
        "findings: what the pages say about the topic, in one paragraph. keyPoints: 3 to 6 facts about the topic, each with "
        "the URL of the page it comes from (one of the pages given). openQuestions: what the pages leave unanswered."
    ),
    schema={
        "type": "object",
        "properties": {
            "companyName": {"type": "string"},
            "overview": {"type": "string"},
            "findings": {"type": "string"},
            "keyPoints": {
                "type": "array",
                "items": {"type": "object", "properties": {"point": {"type": "string"}, "source": {"type": "string", "description": "the URL of the page"}}, "required": ["point", "source"]},
            },
            "openQuestions": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["companyName", "overview", "findings", "keyPoints", "openQuestions"],
    },
)
f = r["data"]
read = [p for p in r["pages"] if p["status"] is not None and p["status"] < 400]
print(f"\n{f['companyName']}\n\n{f['overview']}\n\n{f['findings']}\n")
for i, k in enumerate(f["keyPoints"], 1):
    print(f"{i}. {k['point']}\n   ({k['source']})")
if f["openQuestions"]:
    print(f"\nStill open: {'; '.join(f['openQuestions'])}")
print(f"\nRead {len(read)}/{len(r['pages'])} pages with {r['model']} for ${r['usage']['costUsd']:.4f}.")

report = [f"# {f['companyName']}: {topic}", "", f["overview"], "", f["findings"], "", "## Key points", ""]
report += [f"- {k['point']} ([source]({k['source']}))" for k in f["keyPoints"]] + [""]
if f["openQuestions"]:
    report += ["## Still open", ""] + [f"- {q}" for q in f["openQuestions"]] + [""]
out.mkdir(parents=True, exist_ok=True)
(out / "report.md").write_text("\n".join(report))
result = {
    "company": company,
    "topic": topic,
    "searched": [{"title": x["title"], "url": x["url"]} for x in found["results"]],
    "pages": r["pages"],
    **f,
    "model": r["model"],
    "usage": {"modelUsd": r["usage"]["costUsd"], "searches": 0 if found["cached"] else 1},
}
(out / "result.json").write_text(json.dumps(result, indent=2, ensure_ascii=False))
