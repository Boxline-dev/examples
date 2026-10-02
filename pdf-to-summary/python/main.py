"""PDF to summary: download a PDF in the session's shell, turn it into text with pdftotext, and have a model sum it
up in 5 bullet points from the session's browser. The default is "Attention Is All You Need" on arXiv.

    python python/main.py            (BOXLINE_API_KEY; PDF_URL for another PDF; a plan with shell sessions)

Writes output/document.txt and output/summary.md.
"""
import json
import os
from pathlib import Path

from boxline import Boxline

out = Path(os.environ.get("OUTPUT_DIR", "output"))
pdf_url = os.environ.get("PDF_URL", "https://arxiv.org/pdf/1706.03762")
bx = Boxline()

with bx.sessions.create(shell=True, timeout=600, user_metadata={"example": "pdf-to-summary"}) as session:
    print(f"Session: {session.id}", flush=True)
    # 1. The shell: download the PDF and turn it into text (poppler's pdftotext is installed).
    r = session.exec(
        'mkdir -p downloads output && curl -sSfL --max-time 120 -o downloads/document.pdf "$PDF_URL" '
        "&& pdftotext -layout downloads/document.pdf output/document.txt && wc -c < downloads/document.pdf",
        env={"PDF_URL": pdf_url},
        timeout_ms=300_000,
    )
    if r["exitCode"] != 0:
        raise SystemExit(f"the download or pdftotext failed: {r['stderr'].strip()}")
    pdf_bytes = int(r["stdout"].strip())
    text = session.files.read_text("output/document.txt")
    print(f"{pdf_bytes // 1024} KB PDF -> {len(text)} characters of text")

    # 2. The browser shows the text (the first 40,000 characters), and a model summarises the page.
    session.evaluate(
        'document.title = "document.txt"; document.body.innerHTML = "<pre></pre>"; '
        f'document.querySelector("pre").textContent = {json.dumps(text[:40_000])}; true'
    )
    r = session.extract(
        "The document's title, and a summary of the document in exactly 5 short bullet points.",
        schema={
            "type": "object",
            "properties": {"title": {"type": "string"}, "bullets": {"type": "array", "items": {"type": "string"}, "minItems": 5, "maxItems": 5}},
            "required": ["title", "bullets"],
        },
    )
    data = r["data"]
    summary = f"# {data['title']}\n\n" + "\n".join(f"- {b}" for b in data["bullets"]) + "\n"
    print("\n" + summary)

    out.mkdir(parents=True, exist_ok=True)
    (out / "document.txt").write_text(text)
    (out / "summary.md").write_text(summary)
    result = {"pdfUrl": pdf_url, "pdfBytes": pdf_bytes, "textChars": len(text), "title": data["title"], "bullets": data["bullets"], "model": r["model"],
              "usage": {"modelUsd": r["usage"]["costUsd"]}}
    (out / "result.json").write_text(json.dumps(result, indent=2, ensure_ascii=False))
