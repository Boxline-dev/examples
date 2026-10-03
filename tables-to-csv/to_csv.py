"""Runs in the session's shell: tables.json (from tables.js) to one CSV per table, and the numbers in each column
(count, sum, min, max, mean) computed here, not by a model. Prints a JSON summary."""
import csv
import json
import re
from pathlib import Path

NUMBER = re.compile(r"^[^\d-]*(-?\d[\d,  ]*(?:\.\d+)?)")


def number(cell: str):
    """The first number in a cell: '1,204,567' → 1204567, '82.5 m' → 82.5; None when it is not a number."""
    m = NUMBER.match(cell.strip())
    if not m:
        return None
    try:
        return float(re.sub(r"[,  ]", "", m.group(1)))
    except ValueError:
        return None


tables = json.loads(Path("tables.json").read_text())
Path("tables").mkdir(exist_ok=True)
summary = []
for t in tables:
    name = f"tables/table-{t['index']}.csv"
    with open(name, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(t["headers"])
        w.writerows(t["rows"])
    numeric = []
    for col, header in enumerate(t["headers"]):
        cells = [row[col] for row in t["rows"] if row[col]]
        values = [v for v in (number(c) for c in cells) if v is not None]
        # A numeric column: almost every filled cell is a number (a stray "n/a" is fine).
        if cells and len(values) >= max(2, 0.8 * len(cells)):
            numeric.append({"column": header, "count": len(values), "sum": round(sum(values), 6), "min": min(values), "max": max(values), "mean": round(sum(values) / len(values), 6)})
    summary.append({"index": t["index"], "caption": t["caption"], "csv": name, "rows": len(t["rows"]), "columns": len(t["headers"]), "numeric": numeric})
print(json.dumps(summary))
