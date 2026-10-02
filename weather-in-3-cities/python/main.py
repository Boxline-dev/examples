"""Weather in 3 cities: open the same weather page through residential proxies in three cities, with the browser in
"realistic" mode (its clock and language follow the proxy), and compare the local weather and time.

    python python/main.py            (BOXLINE_API_KEY; a plan with residential proxies and the realistic browser)

wttr.in picks the weather for the place the request comes from. Proxy traffic counts against the plan's allowance.
Writes output/result.json.
"""
import json
import os
from pathlib import Path

from boxline import Boxline

out = Path(os.environ.get("OUTPUT_DIR", "output"))
CITIES = [
    {"name": "New York", "country": "US", "city": "new_york"},
    {"name": "London", "country": "GB", "city": "london"},
    {"name": "Tokyo", "country": "JP", "city": "tokyo"},
]
bx = Boxline()

rows = []
for c in CITIES:
    with bx.sessions.create(
        timeout=300,
        proxy={"type": "residential", "country": c["country"], "city": c["city"]},
        browser_options={"mode": "realistic"},
        user_metadata={"example": "weather-in-3-cities"},
    ) as session:
        print(f"Session: {session.id} ({c['name']})", flush=True)
        session.goto("https://wttr.in/?format=j1")
        # Chrome shows JSON as text (with its own "Pretty-print" control around it): parse from the first { to the last }.
        text = session.content("text")["content"]
        w = json.loads(text[text.index("{"): text.rindex("}") + 1])
        clock = session.evaluate("({ time: new Date().toString(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, language: navigator.language })")
        now, area = w["current_condition"][0], w["nearest_area"][0]
        rows.append({
            "city": c["name"],
            "area": f"{area['areaName'][0]['value']}, {area['country'][0]['value']}",
            "tempC": float(now["temp_C"]),
            "weather": now["weatherDesc"][0]["value"],
            **clock,
        })
        print(f"{c['name']}: {area['areaName'][0]['value']}, {now['temp_C']} °C, {now['weatherDesc'][0]['value']}; "
              f"the browser's clock: {clock['time']} ({clock['timeZone']}, {clock['language']})")

out.mkdir(parents=True, exist_ok=True)
(out / "result.json").write_text(json.dumps({"rows": rows}, indent=2, ensure_ascii=False))
