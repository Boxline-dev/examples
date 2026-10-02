"""Store trust check: before buying from an online store you do not know, gather the signals that separate a real shop
from a scam and score them, with every reason shown: who runs it (name, address, phone), its returns and privacy
policies, how you can pay, pressure tactics and too-good discounts (read from its pages), how old its domain is
(RDAP) and its certificate (openssl), checked in a session's shell.

    python python/main.py            (BOXLINE_API_KEY; STORE_URLS comma-separated; a plan with shell sessions)

It only reads public pages and registry data. Writes output/result.json and output/report.md.
"""
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

from boxline import Boxline

out = Path(os.environ.get("OUTPUT_DIR", "output"))
stores = [u.strip() for u in os.environ.get("STORE_URLS", "https://books.toscrape.com/").split(",") if u.strip()]
bx = Boxline()
POLICY = re.compile(r"contact|about|imprint|impressum|legal|return|refund|privacy|terms|shipping|faq", re.I)
SCHEMA = {
    "type": "object",
    "properties": {
        "business": {"type": "object", "properties": {"name": {"type": ["string", "null"]}, "address": {"type": ["string", "null"]}, "phone": {"type": ["string", "null"]}, "companyNumber": {"type": ["string", "null"]}}, "required": ["name", "address", "phone", "companyNumber"]},
        "returnsPolicy": {"type": "object", "properties": {"present": {"type": "boolean"}, "allowsReturns": {"type": "boolean"}, "window": {"type": ["string", "null"]}}, "required": ["present", "allowsReturns", "window"]},
        "privacyPolicy": {"type": "boolean"},
        "paymentMethods": {"type": "array", "items": {"type": "string"}},
        "pressureTactics": {"type": "array", "items": {"type": "string"}},
        "discountClaims": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["business", "returnsPolicy", "privacyPolicy", "paymentMethods", "pressureTactics", "discountClaims"],
}

results, model_usd = [], 0.0
with bx.sessions.create(browser=False, shell=True, timeout=600, idle_timeout=300, user_metadata={"example": "store-trust-check"}) as session:
    print(f"Session: {session.id}", flush=True)
    for store in stores:
        host = urlparse(store).hostname or ""
        domain = ".".join(host.split(".")[-2:])
        # 1. The domain's registration date (RDAP, the registries' public API) and its certificate, from the machine.
        rdap = session.exec("""curl -sL --max-time 20 "https://rdap.org/domain/$DOMAIN" | jq -r '[.events[]? | select(.eventAction=="registration") | .eventDate][0] // empty'""", env={"DOMAIN": domain}, timeout_ms=60_000)
        registered = rdap["stdout"].strip() or None
        age_days = (datetime.now(timezone.utc) - datetime.fromisoformat(registered.replace("Z", "+00:00"))).days if registered else None
        issuer = None
        if store.startswith("https:"):
            tls = session.exec('echo | openssl s_client -connect "$HOST:443" -servername "$HOST" 2>/dev/null | openssl x509 -noout -issuer -enddate 2>/dev/null', env={"HOST": host}, timeout_ms=60_000)
            m = re.search(r"issuer=.*?O ?= ?([^,\n]+)", tls["stdout"])
            issuer = m.group(1).strip() if m else None

        # 2. Its pages: the home page and the policy pages it links to (contact, returns, privacy, terms, …).
        job = bx.crawl.start(store, max_pages=15, max_depth=1, format="markdown")
        crawl = bx.crawl.wait(job["id"], timeout=300)
        policy_pages = [p.get("finalUrl") or p["url"] for p in crawl["data"] if p["url"] != store and not p.get("error") and (p.get("status") or 0) < 400 and (POLICY.search(p["url"]) or POLICY.search(p.get("title") or ""))]
        r = bx.extract(
            urls=[store, *policy_pages][:10],
            prompt=(
                "These are an online store's pages. business: who runs it, as stated (null when not stated). returnsPolicy: whether a returns or refund policy is stated, whether it lets buyers return items for a refund, and its window. "
                "privacyPolicy: whether a privacy policy is stated. paymentMethods: the ways to pay that are named. pressureTactics: countdowns, 'only N left', or similar pressure, quoted. "
                "discountClaims: discounts stated, quoted. Report only what the pages say."
            ),
            schema=SCHEMA,
        )
        model_usd += r["usage"]["costUsd"]
        f = r["data"]

        # 3. The score: each warning sign adds points, and says why.
        signals = []

        def add(points, why):
            signals.append({"points": points, "why": why})

        if not f["business"]["address"]:
            add(2, "no business address on its pages")
        if not f["business"]["phone"]:
            add(1, "no phone number")
        if not f["returnsPolicy"]["present"]:
            add(2, "no returns or refund policy")
        elif not f["returnsPolicy"]["allowsReturns"]:
            add(2, "the store refuses returns or refunds")
        if not f["privacyPolicy"]:
            add(1, "no privacy policy")
        # Cards and wallets can be disputed with the bank; gift cards, crypto and bank transfers cannot.
        reversible = any(not re.search(r"gift", m, re.I) and re.search(r"card|visa|mastercard|amex|paypal|apple pay|google pay|klarna", m, re.I) for m in f["paymentMethods"])
        if f["paymentMethods"] and not reversible:
            add(3, f"only payments you cannot dispute: {', '.join(f['paymentMethods'])}")
        if f["pressureTactics"]:
            add(2, f"pressure tactics: {'; '.join(f['pressureTactics'])}")
        if any(int((re.search(r"(\d{2,3})\s*%", d) or [0, "0"])[1]) >= 80 for d in f["discountClaims"]):
            add(1, f"discounts too good to be true: {'; '.join(f['discountClaims'])}")
        if age_days is not None and age_days < 90:
            add(2, f"the domain is {age_days} days old")
        if not store.startswith("https:"):
            add(1, "no HTTPS")
        score = sum(s["points"] for s in signals)
        risk = "high" if score >= 6 else "medium" if score >= 3 else "low"
        run_by = f", run by {f['business']['name']}" if f["business"]["name"] else ""
        print(f"\n{store}: {risk.upper()} risk ({score} points){run_by}")
        for s in signals:
            print(f"  +{s['points']}  {s['why']}")
        print(f"  domain registered: {registered or 'unknown'}" + (f"; certificate from {issuer}" if issuer else "") + f"; {len(policy_pages)} policy pages read")
        results.append({"store": store, "risk": risk, "score": score, "signals": signals, "facts": f, "domain": {"name": domain, "registered": registered, "ageDays": age_days}, "certificateIssuer": issuer, "pagesRead": [store, *policy_pages][:10]})

md = ["# Store trust check", "", "A score from public signals, not a verdict: check anything that matters yourself.", ""]
for x in results:
    md += [f"## {x['store']}: {x['risk']} risk ({x['score']} points)", ""] + ([f"- +{s['points']} {s['why']}" for s in x["signals"]] or ["- no warning signs found"]) + [""]
out.mkdir(parents=True, exist_ok=True)
(out / "report.md").write_text("\n".join(md))
(out / "result.json").write_text(json.dumps({"stores": results, "usage": {"modelUsd": model_usd}}, indent=2, ensure_ascii=False))
