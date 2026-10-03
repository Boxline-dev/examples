"""Tables to CSV: every data table on a page, read in a real browser (merged cells filled in, footnote marks left
out), written as CSV files, with each numeric column's count, sum, min, max and mean computed in the session's
shell. No model: what is in the CSV is what is on the page.

    python python/main.py            (BOXLINE_API_KEY; PAGE_URL; a plan with shell sessions)

Writes output/tables/table-N.csv, output/summary.md and output/result.json.
"""
import json
import os
from pathlib import Path

from boxline import Boxline

here = Path(__file__).resolve().parent
out = Path(os.environ.get("OUTPUT_DIR", "output"))
url = os.environ.get("PAGE_URL", "https://en.wikipedia.org/wiki/List_of_largest_cities")
bx = Boxline()

with bx.sessions.create(shell=True, timeout=600, user_metadata={"example": "tables-to-csv"}) as session:
    print(f"Session: {session.id}", flush=True)
    # 1. The tables, as the browser shows them: tables.js expands rowspan and colspan into a full grid.
    page = session.goto(url)
    tables = session.evaluate((here.parent / "tables.js").read_text())
    print(f"{page['title']}: {len(tables)} tables", flush=True)
    if not tables:
        raise SystemExit("no data table on this page")

    # 2. CSV files and the numbers, in the shell (Python's csv module; no model reads the data).
    session.files.write("tables.json", json.dumps(tables))
    session.files.write("to_csv.py", (here.parent / "to_csv.py").read_bytes())
    r = session.exec("python3 to_csv.py")
    if r["exitCode"] != 0:
        raise SystemExit(f"to_csv.py failed: {r['stderr'].strip()}")
    summary = json.loads(r["stdout"])

    (out / "tables").mkdir(parents=True, exist_ok=True)
    md = [f"# Tables on {page['title']}", "", url, ""]
    for t in summary:
        (out / t["csv"]).write_bytes(session.files.read(t["csv"]))
        caption = f" ({t['caption']})" if t["caption"] else ""
        print(f"  {t['csv']}: {t['rows']} rows × {t['columns']} columns{caption}")
        md += [f"## Table {t['index']}" + (f": {t['caption']}" if t["caption"] else ""), "", f"{t['rows']} rows, {t['columns']} columns: `{t['csv']}`", ""]
        if t["numeric"]:
            md += ["| Column | Count | Sum | Min | Max | Mean |", "|---|---|---|---|---|---|"]
            md += [f"| {n['column']} | {n['count']} | {n['sum']} | {n['min']} | {n['max']} | {n['mean']} |" for n in t["numeric"]]
            md.append("")

(out / "summary.md").write_text("\n".join(md) + "\n")
result = {"url": url, "title": page["title"], "tables": [{**t, "headers": tables[t["index"] - 1]["headers"], "domDataRows": tables[t["index"] - 1]["domDataRows"]} for t in summary]}
(out / "result.json").write_text(json.dumps(result, indent=2, ensure_ascii=False))
