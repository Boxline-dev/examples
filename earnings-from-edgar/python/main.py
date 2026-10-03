"""Earnings from EDGAR: yearly revenue, net income and diluted EPS of a few companies from SEC EDGAR's official
companyfacts API, with growth and margins worked out in a session's shell (Python), a CSV, a chart and a summary.
The numbers are the ones the companies filed; no model reads or writes them.

    python python/main.py            (BOXLINE_API_KEY; TICKERS; SEC_USER_AGENT; a plan with shell sessions)

Writes output/earnings.csv, output/chart.png, output/summary.md and output/result.json.
"""
import json
import os
from pathlib import Path

from boxline import Boxline

here = Path(__file__).resolve().parent
out = Path(os.environ.get("OUTPUT_DIR", "output"))
user_agent = os.environ.get("SEC_USER_AGENT", "")
if "@" not in user_agent:
    raise SystemExit('Set SEC_USER_AGENT to your name and email, e.g. "Jane Doe jane@example.com": SEC asks every automated client to declare one.')
env = {"TICKERS": os.environ.get("TICKERS", "AAPL,MSFT,NVDA"), "SEC_USER_AGENT": user_agent, "YEARS": os.environ.get("YEARS", "4")}
for name in ("EDGAR_DATA_URL", "EDGAR_TICKERS_URL"):
    if os.environ.get(name):
        env[name] = os.environ[name]
bx = Boxline()

with bx.sessions.create(browser=False, shell=True, timeout=300, user_metadata={"example": "earnings-from-edgar"}) as session:
    print(f"Session: {session.id}", flush=True)
    session.files.write("edgar.py", (here.parent / "edgar.py").read_bytes())
    r = session.exec("python3 edgar.py", env=env, timeout_ms=180_000)
    if r["exitCode"] != 0:
        raise SystemExit(f"edgar.py failed: {(r['stderr'].strip().splitlines() or ['no output'])[-1]}")
    result = json.loads(r["stdout"])

    out.mkdir(parents=True, exist_ok=True)
    for name in ("earnings.csv", "chart.png", "summary.md"):
        (out / name).write_bytes(session.files.read(name))

for c in result["companies"]:
    last = c["years"][-1]
    growth = f" ({last['revenueGrowthPct']:+}%)" if "revenueGrowthPct" in last else ""
    print(f"{c['ticker']}, year to {last['end']}: revenue ${last['revenue'] / 1e6:.1f}M{growth}, net margin {last['netMarginPct']}%, EPS {last['eps']}  [{c['revenueConcept']}]")
print(f"{result['requests']} requests to EDGAR; output/summary.md, output/earnings.csv, output/chart.png")
(out / "result.json").write_text(json.dumps({"tickers": env["TICKERS"].split(","), **result}, indent=2))
