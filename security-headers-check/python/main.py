"""Security headers check: which security headers a site sends, which are missing, and how its cookies are flagged.
fetch opens the page in a real browser (final address, status); curl in the session's shell reads the raw headers.

    python python/main.py            (BOXLINE_API_KEY; SITE_URL for your own site; a plan with shell sessions)

Writes output/result.json.
"""
import json
import os
import re
from pathlib import Path

from boxline import Boxline

out = Path(os.environ.get("OUTPUT_DIR", "output"))
url = os.environ.get("SITE_URL", "https://books.toscrape.com/")
bx = Boxline()
FOREIGN_ORIGIN = "https://cors-check.example"

WANTED = {
    "strict-transport-security": "forces HTTPS on later visits",
    "content-security-policy": "limits where scripts, styles and frames come from",
    "x-content-type-options": "stops the browser guessing file types",
    "referrer-policy": "limits what the Referer header gives away",
    "permissions-policy": "switches off browser features the site does not use",
}

# 1. The page in a real browser: where it ends up and with which status.
page = bx.fetch(url, format="text")
print(f'{page["finalUrl"]} answered {page["status"]} ("{page["title"]}")')

# 2. The raw headers, from curl in the session's shell (the address goes in as an environment variable, not code).
with bx.sessions.create(browser=False, shell=True, timeout=300, user_metadata={"example": "security-headers-check"}) as session:
    print(f"Session: {session.id}", flush=True)
    curl = "curl -sS -o /dev/null -D - -L --max-redirs 5 --max-time 30"
    r = session.exec(f'{curl} "$TARGET_URL"', env={"TARGET_URL": url})
    if r["exitCode"] != 0:
        raise SystemExit(f"curl failed: {r['stderr'].strip()}")
    # A second request says Origin: another site, to see whether the site lets other sites read its answers (CORS).
    cors = session.exec(f'{curl} -H "Origin: $ORIGIN" "$TARGET_URL"', env={"TARGET_URL": url, "ORIGIN": FOREIGN_ORIGIN})

blocks = [b for b in re.split(r"\r?\n\r?\n", r["stdout"].strip()) if b]
# Every hop of the redirect chain: its status and where it sends the browser.
redirects = []
for b in blocks[:-1]:
    status = re.match(r"^HTTP/[\d.]+ (\d{3})", b)
    location = re.search(r"^location:\s*(.+)$", b, re.I | re.M)
    redirects.append({"status": int(status.group(1)) if status else 0, "location": location.group(1).strip() if location else None})
last = blocks[-1]  # after redirects, the final answer
headers, cookies = {}, []
for line in re.split(r"\r?\n", last)[1:]:
    name, sep, value = line.partition(":")
    if not sep:
        continue
    name, value = name.strip().lower(), value.strip()
    if name == "set-cookie":
        same_site = re.search(r";\s*samesite=(\w+)", value, re.I)
        cookies.append({
            "name": value.split("=")[0].strip(),
            "secure": bool(re.search(r";\s*secure\b", value, re.I)),
            "httpOnly": bool(re.search(r";\s*httponly\b", value, re.I)),
            "sameSite": same_site.group(1) if same_site else "not set",
        })
    else:
        headers[name] = value

present = [h for h in WANTED if h in headers]
missing = [h for h in WANTED if h not in headers]
if "x-frame-options" in headers or "frame-ancestors" in headers.get("content-security-policy", "").lower():
    present.append("x-frame-options" if "x-frame-options" in headers else "csp frame-ancestors")
else:
    missing.append("x-frame-options (or CSP frame-ancestors)")

# HSTS in detail: how long browsers must stick to HTTPS, and whether subdomains and the preload list are covered.
hsts_value = headers.get("strict-transport-security")
hsts = None
if hsts_value:
    age = re.search(r"max-age=(\d+)", hsts_value, re.I)
    hsts = {"maxAgeDays": round(int(age.group(1)) / 86400) if age else 0, "includeSubDomains": "includesubdomains" in hsts_value.lower(), "preload": "preload" in hsts_value.lower()}
# CORS: what the site answered to a request from another site.
cors_headers = ([b for b in re.split(r"\r?\n\r?\n", cors["stdout"].strip()) if b] or [""])[-1].lower()
m = re.search(r"^access-control-allow-origin:\s*(.+)$", cors_headers, re.M)
allow_origin = m.group(1).strip() if m else None
allow_credentials = bool(re.search(r"^access-control-allow-credentials:\s*true", cors_headers, re.M))
if allow_origin == FOREIGN_ORIGIN.lower() and allow_credentials:
    cors_risk = "it echoes any site's origin and allows credentials: any site can read a signed-in visitor's answers"
elif allow_origin == FOREIGN_ORIGIN.lower():
    cors_risk = "it echoes any site's origin (fine for public data only)"
elif allow_origin == "*":
    cors_risk = "open to every site (fine for public data)"
else:
    cors_risk = None

for hop in redirects:
    print(f"  redirect {hop['status']} → {hop['location']}")
for h in present:
    print(f"  ok       {h}")
for h in missing:
    print(f"  MISSING  {h}: {WANTED.get(h, 'stops other sites framing yours (clickjacking)')}")
for c in cookies:
    print(f"  cookie {c['name']}: {'Secure' if c['secure'] else 'not Secure'}, {'HttpOnly' if c['httpOnly'] else 'readable by scripts'}, SameSite {c['sameSite']}")
if hsts:
    print(f"  HSTS: {hsts['maxAgeDays']} days" + (", subdomains" if hsts["includeSubDomains"] else "") + (", preload" if hsts["preload"] else "") + (" (under the 180 days browsers expect)" if hsts["maxAgeDays"] < 180 else ""))
shared = f"Access-Control-Allow-Origin {allow_origin}" + (" with credentials" if allow_credentials else "") if allow_origin else "not shared with other sites"
print(f"  CORS: {shared}" + (f": {cors_risk}" if cors_risk else ""))

out.mkdir(parents=True, exist_ok=True)
result = {"url": url, "finalUrl": page["finalUrl"], "status": page["status"], "redirects": redirects, "present": present, "missing": missing, "cookies": cookies, "hsts": hsts, "cors": {"allowOrigin": allow_origin, "allowCredentials": allow_credentials, "risk": cors_risk}}
(out / "result.json").write_text(json.dumps(result, indent=2))
