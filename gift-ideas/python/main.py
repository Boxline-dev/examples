"""Gift ideas: describe the person and a budget, and get gift ideas found on real gift guides and reviews, each with
why it suits them, a price range, and the page it came from. Ideas over the budget are left out.

    python python/main.py            (BOXLINE_API_KEY; RECIPIENT, BUDGET, CURRENCY)

One search, then one extract over the top pages. Writes output/result.json and output/ideas.md.
"""
import json
import os
import re
from pathlib import Path

from boxline import Boxline

out = Path(os.environ.get("OUTPUT_DIR", "output"))
recipient = os.environ.get("RECIPIENT", "a friend in their thirties who loves rock climbing and good coffee")
budget = float(os.environ.get("BUDGET", "60"))
currency = os.environ.get("CURRENCY", "USD")
bx = Boxline()

# 1. Gift guides and reviews for this person (the platform's search; no shop is scraped).
found = bx.search(f"gift ideas for {recipient} under {budget:g} {currency}", limit=8)
urls = [x["url"] for x in found["results"]][:5]
print(f"Reading {len(urls)} pages:\n" + "\n".join(f"  {u}" for u in urls))
if not urls:
    raise SystemExit("the search found nothing; describe the person differently")

# 2. Ideas from those pages, each tied to the person and to its page.
r = bx.extract(
    urls=urls,
    prompt=(
        f"Gift ideas for {recipient}, with a budget of {budget:g} {currency}. From these pages only: 6 to 10 ideas, the most fitting first. "
        "why: one sentence on why it suits this person. priceMin / priceMax: the price range the page gives (null when it gives none). source: the URL of the page it is from."
    ),
    schema={
        "type": "object",
        "properties": {
            "ideas": {
                "type": "array",
                "items": {"type": "object", "properties": {"idea": {"type": "string"}, "why": {"type": "string"}, "priceMin": {"type": ["number", "null"]}, "priceMax": {"type": ["number", "null"]}, "currency": {"type": ["string", "null"]}, "source": {"type": "string"}}, "required": ["idea", "why", "priceMin", "priceMax", "currency", "source"]},
            }
        },
        "required": ["ideas"],
    },
)


def strip(u):
    return re.sub(r"[#?].*$", "", u or "").rstrip("/")


known = {strip(u) for p in r["pages"] if not p.get("error") and (p.get("status") or 0) < 400 for u in (p["url"], p.get("finalUrl")) if u}
# Kept: ideas from a page that was read, within the budget when a price is given (in the same currency).
ideas = [i for i in r["data"]["ideas"] if strip(i["source"]) in known and not (i["priceMin"] is not None and (i["currency"] or currency) == currency and i["priceMin"] > budget)]


def price(i):
    if i["priceMin"] is None:
        return ""
    upper = f"–{i['priceMax']:g}" if i["priceMax"] and i["priceMax"] != i["priceMin"] else ""
    return f" ({i['priceMin']:g}{upper} {i['currency'] or currency})"


print(f"\n{len(ideas)} ideas within {budget:g} {currency} (of {len(r['data']['ideas'])} found):")
for i in ideas:
    print(f"  • {i['idea']}{price(i)}\n    {i['why']}\n    {i['source']}")
md = [f"# Gift ideas for {recipient}", "", f"Budget: {budget:g} {currency}.", ""] + [f"- **{i['idea']}**{price(i)}: {i['why']} ([source]({i['source']}))" for i in ideas] + [""]
out.mkdir(parents=True, exist_ok=True)
(out / "ideas.md").write_text("\n".join(md))
result = {"recipient": recipient, "budget": budget, "currency": currency, "pages": r["pages"], "ideas": ideas, "dropped": len(r["data"]["ideas"]) - len(ideas), "usage": {"modelUsd": r["usage"]["costUsd"], "searches": 0 if found["cached"] else 1}}
(out / "result.json").write_text(json.dumps(result, indent=2, ensure_ascii=False))
