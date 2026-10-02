"""Financial report to data: find a company's latest quarterly report on its investor page, download the PDF in the
session's shell, turn it into text with pdftotext, and have a model pull out the key figures as JSON.

    INVESTOR_URL=https://… python python/main.py     (BOXLINE_API_KEY; a plan with shell sessions)

Writes output/report.txt and output/figures.json.
"""
import json
import os
import re
from pathlib import Path

from boxline import Boxline

out = Path(os.environ.get("OUTPUT_DIR", "output"))
investor_url = os.environ.get("INVESTOR_URL")
if not investor_url:
    raise SystemExit("Set INVESTOR_URL to the company's investor relations page (the one that lists its reports)")
bx = Boxline()


def quarter_of(link: dict) -> int:
    """20263 for "Q3 2026" (or "2026 Q3") in the link's text or address, else 0."""
    s = f"{link['text']} {link['href']}"
    m = re.search(r"\bQ([1-4])\W{0,3}((?:19|20)\d\d)\b", s, re.I)
    if m:
        return int(m.group(2)) * 10 + int(m.group(1))
    m = re.search(r"\b((?:19|20)\d\d)\W{0,3}Q([1-4])\b", s, re.I)
    return int(m.group(1)) * 10 + int(m.group(2)) if m else 0


with bx.sessions.create(shell=True, timeout=600, user_metadata={"example": "financial-report-to-data"}) as session:
    print(f"Session: {session.id}", flush=True)
    # 1. The browser: the investor page's PDF links; the latest quarter is the highest "Qn YYYY" (in any order).
    session.goto(investor_url)
    links = session.evaluate('[...document.querySelectorAll("a[href]")].map((a) => ({ text: a.textContent.trim(), href: a.href }))')
    reports = sorted((l for l in links if re.search(r"\.pdf(\?|$)", l["href"], re.I) and quarter_of(l)), key=quarter_of, reverse=True)
    if not reports:
        raise SystemExit(f"no quarterly report PDF linked from {investor_url}")
    latest = reports[0]
    print(f"Latest quarterly report: {latest['text']} ({latest['href']})")

    # 2. The shell: download it with the browser's cookies, then pdftotext.
    session.export_cookies("cookies.txt")
    r = session.exec(
        'mkdir -p downloads output && curl -sSfL --max-time 120 -b cookies.txt -o downloads/report.pdf "$REPORT_URL" '
        "&& pdftotext -layout downloads/report.pdf output/report.txt",
        env={"REPORT_URL": latest["href"]},
        timeout_ms=300_000,
    )
    if r["exitCode"] != 0:
        raise SystemExit(f"the download or pdftotext failed: {r['stderr'].strip()}")
    text = session.files.read_text("output/report.txt")

    # 3. A model reads the text (shown in the session's browser) into a fixed shape.
    session.evaluate(
        'document.title = "report.txt"; document.body.innerHTML = "<pre></pre>"; '
        f'document.querySelector("pre").textContent = {json.dumps(text[:40_000])}; true'
    )
    r = session.extract(
        "The key figures of this quarterly report.",
        schema={
            "type": "object",
            "properties": {
                "company": {"type": "string"},
                "period": {"type": "string", "description": 'the quarter, written like "Q3 2026"'},
                "currency": {"type": "string", "description": "ISO 4217 code, e.g. USD"},
                "revenueMillions": {"type": "number", "description": "revenue for the quarter, in millions"},
                "netIncomeMillions": {"type": "number", "description": "net income (profit) for the quarter, in millions"},
                "dilutedEps": {"type": ["number", "null"], "description": "diluted earnings per share"},
                "cashMillions": {"type": ["number", "null"], "description": "cash and cash equivalents at the end of the quarter, in millions"},
            },
            "required": ["company", "period", "currency", "revenueMillions", "netIncomeMillions", "dilutedEps", "cashMillions"],
        },
    )
    f = r["data"]
    print(f"{f['company']}, {f['period']}: revenue {f['revenueMillions']} m {f['currency']}, net income {f['netIncomeMillions']} m, "
          f"diluted EPS {f['dilutedEps']}, cash {f['cashMillions']} m")

    out.mkdir(parents=True, exist_ok=True)
    (out / "report.txt").write_text(text)
    (out / "figures.json").write_text(json.dumps(f, indent=2))
    result = {"investorUrl": investor_url, "report": latest, "figures": f, "model": r["model"], "usage": {"modelUsd": r["usage"]["costUsd"]}}
    (out / "result.json").write_text(json.dumps(result, indent=2, ensure_ascii=False))
