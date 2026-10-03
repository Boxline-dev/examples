"""Runs in the session's shell: yearly revenue, net income and diluted EPS of a few companies from SEC EDGAR's
companyfacts API (the numbers the companies filed in XBRL), growth and margins worked out here, a CSV, a chart and a
short summary. Prints the result as JSON.

Environment: TICKERS (e.g. AAPL,MSFT), SEC_USER_AGENT (your name and email: SEC asks every automated client to declare
one), YEARS (default 4), EDGAR_DATA_URL and EDGAR_TICKERS_URL (SEC's by default).

How a yearly value is chosen: facts from 10-K filings whose period is about a year (350-380 days), one per period end;
when several filings report the same period (each 10-K repeats the two years before it, and may restate one), the one
filed last wins. Quarterly (10-Q) facts are left out."""
import csv
import json
import os
import time
from datetime import date

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import requests  # noqa: E402

TICKERS = [t.strip().upper() for t in os.environ.get("TICKERS", "AAPL,MSFT").split(",") if t.strip()]
YEARS = int(os.environ.get("YEARS", "4"))
DATA = os.environ.get("EDGAR_DATA_URL", "https://data.sec.gov").rstrip("/")
TICKERS_URL = os.environ.get("EDGAR_TICKERS_URL", "https://www.sec.gov/files/company_tickers.json")
http = requests.Session()
http.headers.update({"User-Agent": os.environ["SEC_USER_AGENT"], "Accept-Encoding": "gzip, deflate"})
REVENUE = ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "SalesRevenueNet", "RevenueFromContractWithCustomerIncludingAssessedTax"]
calls = 0


def get(url):
    global calls
    calls += 1
    time.sleep(0.15)  # SEC's fair-access limit is 10 requests a second; this stays well under it
    r = http.get(url, timeout=60)
    r.raise_for_status()
    return r.json()


def yearly(facts, concept, unit):
    """{period end: (value, filed)} for one concept: full-year 10-K values, the latest filing per period."""
    out = {}
    for f in facts.get(concept, {}).get("units", {}).get(unit, []):
        if not f.get("form", "").startswith("10-K") or "start" not in f:
            continue
        days = (date.fromisoformat(f["end"]) - date.fromisoformat(f["start"])).days
        if not 350 <= days <= 380:
            continue
        if f["end"] not in out or f["filed"] > out[f["end"]][1]:
            out[f["end"]] = (f["val"], f["filed"])
    return out


ciks = {v["ticker"].upper(): (v["cik_str"], v["title"]) for v in get(TICKERS_URL).values()}
companies = []
for ticker in TICKERS:
    if ticker not in ciks:
        raise SystemExit(f"{ticker} is not in SEC's ticker list")
    cik, title = ciks[ticker]
    gaap = get(f"{DATA}/api/xbrl/companyfacts/CIK{cik:010d}.json")["facts"].get("us-gaap", {})
    # Companies change the concept they file revenue under: take the one with the most recent year.
    options = [(c, yearly(gaap, c, "USD")) for c in REVENUE]
    concept, revenue = max(options, key=lambda o: (max(o[1], default=""), len(o[1])))
    income = yearly(gaap, "NetIncomeLoss", "USD")
    eps = yearly(gaap, "EarningsPerShareDiluted", "USD/shares")
    years = []
    for end in sorted(revenue)[-YEARS:]:
        rev = revenue[end][0]
        ni = income.get(end, (None,))[0]
        years.append({"end": end, "revenue": rev, "netIncome": ni, "eps": eps.get(end, (None,))[0], "filed": revenue[end][1],
                      "netMarginPct": round(100 * ni / rev, 1) if ni is not None and rev else None})
    for prev, cur in zip(years, years[1:]):
        cur["revenueGrowthPct"] = round(100 * (cur["revenue"] / prev["revenue"] - 1), 1)
    companies.append({"ticker": ticker, "cik": cik, "name": title, "revenueConcept": concept, "years": years})

with open("earnings.csv", "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["ticker", "year_end", "revenue_usd", "net_income_usd", "eps_diluted", "revenue_growth_pct", "net_margin_pct", "filed"])
    for c in companies:
        for y in c["years"]:
            w.writerow([c["ticker"], y["end"], y["revenue"], y["netIncome"], y["eps"], y.get("revenueGrowthPct", ""), y["netMarginPct"], y["filed"]])

fig, axes = plt.subplots(1, len(companies), figsize=(5 * len(companies), 4), squeeze=False)
for ax, c in zip(axes[0], companies):
    labels = [y["end"][:7] for y in c["years"]]
    xs = range(len(labels))
    ax.bar([x - 0.2 for x in xs], [y["revenue"] / 1e6 for y in c["years"]], 0.4, label="Revenue", color="#1f6feb")
    ax.bar([x + 0.2 for x in xs], [(y["netIncome"] or 0) / 1e6 for y in c["years"]], 0.4, label="Net income", color="#2da44e")
    ax.axhline(0, color="#888", linewidth=0.8)
    ax.set_xticks(list(xs), labels)
    ax.set_title(f"{c['ticker']} ({c['name']})", fontsize=10)
    ax.set_ylabel("USD millions")
    ax.legend(fontsize=8)
fig.tight_layout()
fig.savefig("chart.png", dpi=120)


def money(v):
    return "n/a" if v is None else f"${v / 1e9:.2f} billion" if abs(v) >= 1e9 else f"${v / 1e6:.1f} million"


lines = ["# Earnings from SEC EDGAR", "", "Yearly figures as filed in 10-K reports (XBRL companyfacts); growth and margins computed here.", ""]
for c in companies:
    last = c["years"][-1]
    growth = last.get("revenueGrowthPct")
    lines += [f"## {c['ticker']}: {c['name']}", "",
              f"Year ending {last['end']}: revenue {money(last['revenue'])}" + (f" ({growth:+.1f}% on the year before)" if growth is not None else "") +
              f", net income {money(last['netIncome'])} ({last['netMarginPct']}% of revenue), diluted EPS {last['eps']}.", "",
              "| Year end | Revenue | Net income | EPS | Growth | Margin |", "|---|---|---|---|---|---|"]
    lines += [f"| {y['end']} | {money(y['revenue'])} | {money(y['netIncome'])} | {y['eps']} | {y.get('revenueGrowthPct', '')} | {y['netMarginPct']} |" for y in c["years"]]
    lines.append("")
open("summary.md", "w").write("\n".join(lines))
print(json.dumps({"companies": companies, "requests": calls}))
