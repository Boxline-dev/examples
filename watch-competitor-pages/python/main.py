"""Watch competitor pages: check a few pages, tell real changes (a price, a plan, a feature, an announcement) from
noise (a date, a counter), and post the real ones to your chat webhook.

    python python/main.py            (BOXLINE_API_KEY; PAGES, a comma-separated list; SLACK_WEBHOOK_URL optional)

Each check fetches the page as text (cheap). Only when the text changed does a model read the page into facts
(prices, features, announcements), and the code compares those facts with the last ones: what changed is exact,
and a page whose only change is a timestamp is "noise". The facts are kept in STATE_DIR between runs; RUNS=n and
INTERVAL_SECONDS repeat the check (run it from cron, or a Boxline task, for a real schedule).
Writes output/result.json and output/alerts.md.
"""
import hashlib
import json
import os
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from boxline import Boxline

out = Path(os.environ.get("OUTPUT_DIR", "output"))
state_dir = Path(os.environ.get("STATE_DIR", str(out / "state")))
pages = [u.strip() for u in os.environ.get("PAGES", "https://nodejs.org/en/about/previous-releases,https://www.python.org/downloads/").split(",") if u.strip()]
runs = int(os.environ.get("RUNS", "1"))
interval = int(os.environ.get("INTERVAL_SECONDS", "3600"))
chat_hook = os.environ.get("SLACK_WEBHOOK_URL")
bx = Boxline()

FACTS = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "prices": {"type": "array", "items": {"type": "object", "properties": {"item": {"type": "string", "description": "a plan or product name"}, "price": {"type": "string", "description": "as written, e.g. $29"}}, "required": ["item", "price"]}},
        "features": {"type": "array", "items": {"type": "string"}, "description": "features or included items the page lists"},
        "announcements": {"type": "array", "items": {"type": "string"}, "description": "news, posts or release names, by their headline"},
    },
    "required": ["title", "prices", "features", "announcements"],
}


def sha(s: str) -> str:
    return hashlib.sha256(s.encode()).hexdigest()


def state_file(url: str) -> Path:
    return state_dir / f"{sha(url)[:16]}.json"


def load(url: str):
    f = state_file(url)
    return json.loads(f.read_text()) if f.exists() else None


def diff(a, b):
    """What changed between two sets of facts, in plain words (empty: nothing that matters)."""
    changes = []
    before = {p["item"].lower(): p for p in a["prices"]}
    after = {p["item"].lower(): p for p in b["prices"]}
    for k, p in after.items():
        old = before.get(k)
        if not old:
            changes.append(f"new price: {p['item']} {p['price']}")
        elif old["price"] != p["price"]:
            changes.append(f"price of {p['item']}: {old['price']} → {p['price']}")
    for k, p in before.items():
        if k not in after:
            changes.append(f"price removed: {p['item']} (was {p['price']})")
    for label, x, y in (("feature", a["features"], b["features"]), ("announcement", a["announcements"], b["announcements"])):
        xs, ys = {v.lower() for v in x}, {v.lower() for v in y}
        changes += [f"{label} added: {v}" for v in y if v.lower() not in xs]
        changes += [f"{label} removed: {v}" for v in x if v.lower() not in ys]
    return changes


state_dir.mkdir(parents=True, exist_ok=True)
rounds, model_usd, alerts_sent = [], 0.0, 0
for rnd in range(1, runs + 1):
    at = datetime.now(timezone.utc).isoformat()
    seen, alerts = [], []
    for url in pages:
        try:
            page = bx.fetch(url, format="text")  # a real browser in a sandbox; no model, no cost per token
            h = sha(page["content"])
            prev = load(url)
            if prev and prev["hash"] == h:
                seen.append({"url": url, "status": "same", "changes": []})
                print(f"  same      {url}")
                continue
            # The text changed (or this is the first look): read the page into facts. The last facts go into the prompt
            # so unchanged items keep the same wording, and the comparison below stays exact.
            hint = f"\nLast time the facts were (keep this wording for items that did not change): {json.dumps(prev['facts'])[:3000]}" if prev else ""
            r = bx.extract(url=url, prompt=f"The page's prices, features and announcements, as listed on it.{hint}", schema=FACTS)
            model_usd += r["usage"]["costUsd"]
            changes = diff(prev["facts"], r["data"]) if prev else []
            status = "baseline" if not prev else "changed" if changes else "noise"
            state_file(url).write_text(json.dumps({"url": url, "hash": h, "facts": r["data"], "checkedAt": at}, indent=2))
            seen.append({"url": url, "status": status, "changes": changes})
            print(f"  {status.ljust(9)} {url}" + "".join(f"\n              {c}" for c in changes))
            if changes:
                alerts.append(f"*{r['data']['title']}* ({url})\n" + "\n".join(f"• {c}" for c in changes))
        except Exception as err:  # one page failing does not stop the others
            seen.append({"url": url, "status": "failed", "changes": [], "error": str(err)})
            print(f"  failed    {url}: {err}")
    rounds.append({"round": rnd, "at": at, "pages": seen})
    if alerts:
        text = f"Competitor changes ({at[:16].replace('T', ' ')} UTC)\n\n" + "\n\n".join(alerts)
        path = out / "alerts.md"
        path.write_text((path.read_text() + "\n\n" if path.exists() else "") + text)
        if chat_hook:
            req = urllib.request.Request(chat_hook, data=json.dumps({"text": text}).encode(), headers={"content-type": "application/json"}, method="POST")
            try:
                with urllib.request.urlopen(req, timeout=30) as res:
                    alerts_sent += 1
                    print("  posted the changes to the chat webhook")
            except Exception as err:
                print(f"  the chat webhook failed: {err}")
    changed = sum(p["status"] == "changed" for p in seen)
    noise = sum(p["status"] == "noise" for p in seen)
    print(f"Round {rnd} done: {changed} changed, {noise} noise only.", flush=True)
    if rnd == 1 and any(p["status"] == "baseline" for p in seen):
        print("Baseline saved.", flush=True)
    if rnd < runs:
        time.sleep(interval)

(out / "result.json").write_text(json.dumps({"pages": pages, "rounds": rounds, "alertsSent": alerts_sent, "usage": {"modelUsd": model_usd}}, indent=2, ensure_ascii=False))
