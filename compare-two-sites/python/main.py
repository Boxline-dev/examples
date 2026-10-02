"""Compare two sites: read two product sites side by side (headline, features, pricing, what makes each different),
with a screenshot of each, and write a comparison report.

    python python/main.py            (BOXLINE_API_KEY; SITE_A and SITE_B for the two sites)

Writes output/result.json, output/report.md and output/a.png, output/b.png.
"""
import json
import os
from pathlib import Path

from boxline import Boxline

out = Path(os.environ.get("OUTPUT_DIR", "output"))
sites = {"a": os.environ.get("SITE_A", "https://playwright.dev/"), "b": os.environ.get("SITE_B", "https://pptr.dev/")}
bx = Boxline()

SITE = {
    "type": "object",
    "properties": {
        "url": {"type": "string"},
        "name": {"type": "string", "description": "the product's name"},
        "headline": {"type": "string", "description": "the main headline, as written"},
        "features": {"type": "array", "items": {"type": "string"}, "description": "its main features, in a few words each"},
        "pricing": {"type": "string", "description": "the price or pricing model as the page states it; 'not stated' when it does not"},
        "usp": {"type": "string", "description": "what it says makes it different, in one sentence"},
    },
    "required": ["url", "name", "headline", "features", "pricing", "usp"],
}

out.mkdir(parents=True, exist_ok=True)
# 1. A screenshot of each landing page (rendered in a sandboxed browser, never on this computer).
for key, url in sites.items():
    (out / f"{key}.png").write_bytes(bx.screenshot(url, viewport={"width": 1280, "height": 800}))
    print(f"Screenshot of {url}: output/{key}.png")

# 2. Both pages read in one extract call: what each says, and how they compare.
r = bx.extract(
    urls=[sites["a"], sites["b"]],
    prompt=(
        f'Compare two products from their own pages. "a" is {sites["a"]}, "b" is {sites["b"]}. Use only what the pages say. '
        'shared: features both have; onlyA / onlyB: features only one has (use the same wording as in "features"). '
        'cheaper: which one costs less when both state a price, else "unknown". summary: two sentences for a buyer.'
    ),
    schema={
        "type": "object",
        "properties": {
            "a": SITE,
            "b": SITE,
            "shared": {"type": "array", "items": {"type": "string"}},
            "onlyA": {"type": "array", "items": {"type": "string"}},
            "onlyB": {"type": "array", "items": {"type": "string"}},
            "cheaper": {"type": "string", "enum": ["a", "b", "same", "unknown"]},
            "summary": {"type": "string"},
        },
        "required": ["a", "b", "shared", "onlyA", "onlyB", "cheaper", "summary"],
    },
)
c = r["data"]
for key in ("a", "b"):
    s = c[key]
    print(f'\n{key.upper()}: {s["name"]} ({sites[key]})\n  "{s["headline"]}"\n  features: {", ".join(s["features"])}\n  pricing: {s["pricing"]}\n  different: {s["usp"]}')
print(f'\nBoth: {", ".join(c["shared"]) or "nothing in common"}\nOnly {c["a"]["name"]}: {", ".join(c["onlyA"]) or "-"}\nOnly {c["b"]["name"]}: {", ".join(c["onlyB"]) or "-"}')
cheaper = c["a"]["name"] if c["cheaper"] == "a" else c["b"]["name"] if c["cheaper"] == "b" else c["cheaper"]
print(f"Cheaper: {cheaper}\n\n{c['summary']}")


def row(label, f):
    return f"| {label} | {f(c['a'])} | {f(c['b'])} |"


report = [
    f"# {c['a']['name']} vs {c['b']['name']}",
    "",
    c["summary"],
    "",
    f"| | [{c['a']['name']}]({sites['a']}) | [{c['b']['name']}]({sites['b']}) |",
    "|---|---|---|",
    row("Headline", lambda s: s["headline"]),
    row("Pricing", lambda s: s["pricing"]),
    row("Features", lambda s: "<br>".join(s["features"])),
    row("What is different", lambda s: s["usp"]),
    "",
    f"In both: {', '.join(c['shared']) or 'nothing'}.",
    "",
    f"| {c['a']['name']} | {c['b']['name']} |",
    "|---|---|",
    "| ![](a.png) | ![](b.png) |",
    "",
]
(out / "report.md").write_text("\n".join(report))
result = {"sites": sites, **c, "pages": r["pages"], "model": r["model"], "usage": {"modelUsd": r["usage"]["costUsd"]}}
(out / "result.json").write_text(json.dumps(result, indent=2, ensure_ascii=False))
print(f"\nReport: {out / 'report.md'} (${r['usage']['costUsd']:.4f} of model use)")
