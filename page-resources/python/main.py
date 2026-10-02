"""Page resources: open a page in a cloud browser and list everything it loads, from the session's own network log:
requests and bytes by type and by domain, the third parties, what failed, and the slowest and heaviest requests.

    python python/main.py            (BOXLINE_API_KEY; PAGE_URL)

Writes output/result.json, output/report.md and output/page.png.
"""
import json
import os
import re
import time
from pathlib import Path
from urllib.parse import urlparse

from boxline import Boxline

out = Path(os.environ.get("OUTPUT_DIR", "output"))
url = os.environ.get("PAGE_URL", "https://books.toscrape.com/")
bx = Boxline()


def site(host: str) -> str:
    """The site a host belongs to, roughly (its last two labels; three for "co.uk"-style endings)."""
    parts = host.split(".")
    return ".".join(parts[-3:] if len(parts) > 2 and re.fullmatch(r"co|com|org|net|gov|ac|edu", parts[-2]) else parts[-2:])


def kb(b: float) -> str:
    return f"{round(b / 1024, 1)} KB"


with bx.sessions.create(timeout=300, user_metadata={"example": "page-resources"}) as session:
    print(f"Session: {session.id}", flush=True)
    # 1. Load the page until the network is quiet, and keep a picture of it.
    t0 = time.monotonic()
    opened = session.goto(url, wait_until="networkidle")
    load_ms = round((time.monotonic() - t0) * 1000)
    out.mkdir(parents=True, exist_ok=True)
    (out / "page.png").write_bytes(session.screenshot(max_width=1280))  # PNG bytes
    print(f"{opened['url']} ({opened['status']}) loaded in {load_ms / 1000:.1f} s")

    # 2. Its network log: one event per finished (or failed) request. The log is written as requests end: wait a moment.
    time.sleep(1.5)
    events = list(session.events(types=["network"], limit=2000))

mine = site(urlparse(opened["url"]).hostname or "")
rows = []
for e in events:
    host = urlparse(e.get("url") or "").hostname or "?"
    status = e.get("status")
    rows.append({"url": e.get("url"), "host": host, "type": e.get("resourceType") or "Other", "status": status, "ms": e.get("durationMs") or 0, "bytes": int((e.get("data") or {}).get("bytes") or 0), "failed": e.get("level") == "error" or (status or 0) >= 400, "error": e.get("text"), "thirdParty": site(host) != mine})


# 3. Grouped and ranked.
def group(key):
    g = {}
    for r in rows:
        x = g.setdefault(key(r), {"name": key(r), "requests": 0, "bytes": 0})
        x["requests"] += 1
        x["bytes"] += r["bytes"]
    return sorted(g.values(), key=lambda x: -x["bytes"])


by_type = group(lambda r: r["type"])
by_domain = group(lambda r: r["host"])
third_parties = sorted({r["host"] for r in rows if r["thirdParty"]})
failed = [{"url": r["url"], "status": r["status"], "error": r["error"]} for r in rows if r["failed"]]
slowest = [{"url": r["url"], "ms": r["ms"]} for r in sorted(rows, key=lambda r: -r["ms"])[:5]]
heaviest = [{"url": r["url"], "kb": round(r["bytes"] / 1024, 1)} for r in sorted(rows, key=lambda r: -r["bytes"])[:5]]
total_kb = round(sum(r["bytes"] for r in rows) / 1024, 1)

print(f"{len(rows)} requests, {total_kb} KB, {len(third_parties)} third-party hosts, {len(failed)} failed")
for t in by_type:
    print(f"  {t['name']:<12} {t['requests']:>3}  {kb(t['bytes'])}")
if failed:
    print("Failed: " + ", ".join(f"{f['url']} ({f['status'] or f['error']})" for f in failed))
print("Slowest: " + ", ".join(f"{s['url']} {s['ms']} ms" for s in slowest[:3]))

md = [f"# {opened['url']}", "", f"{len(rows)} requests, {total_kb} KB transferred, loaded (network quiet) in {load_ms / 1000:.1f} s.", ""]
md += ["## By type", "", "| Type | Requests | Transferred |", "|---|---|---|", *[f"| {t['name']} | {t['requests']} | {kb(t['bytes'])} |" for t in by_type], ""]
md += ["## By domain", "", "| Domain | Requests | Transferred | Third party |", "|---|---|---|---|", *[f"| {d['name']} | {d['requests']} | {kb(d['bytes'])} | {'yes' if d['name'] in third_parties else ''} |" for d in by_domain], ""]
md += ["## Failed", "", "\n".join(f"- {f['url']}: {f['status'] or f['error']}" for f in failed) or "None.", ""]
md += ["## Slowest", "", "\n".join(f"- {s['url']}: {s['ms']} ms" for s in slowest), "", "## Heaviest", "", "\n".join(f"- {h['url']}: {h['kb']} KB" for h in heaviest), "", "![The page](page.png)", ""]
(out / "report.md").write_text("\n".join(md))
result = {"url": url, "finalUrl": opened["url"], "status": opened["status"], "loadMs": load_ms, "requests": len(rows), "totalKb": total_kb, "byType": by_type, "byDomain": by_domain, "thirdParties": third_parties, "failed": failed, "slowest": slowest, "heaviest": heaviest}
(out / "result.json").write_text(json.dumps(result, indent=2, ensure_ascii=False))
