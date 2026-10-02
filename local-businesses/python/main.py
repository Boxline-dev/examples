"""Local businesses: list the businesses of one kind in a place (cafés in Bath, bike shops in Utrecht…) from
OpenStreetMap's open data, then read the websites they list to say what each offers. A list for finding a place,
a supplier or a venue, with OSM's attribution.

    python python/main.py            (BOXLINE_API_KEY; PLACE, KIND (an OSM tag), LIMIT, ENRICH; a plan with shell sessions)

osm.py queries OpenStreetMap from the session's shell (Nominatim and Overpass, within their usage policies); one
extract reads the businesses' own websites. Writes output/businesses.csv, output/result.json.
"""
import csv
import json
import os
import re
from pathlib import Path

from boxline import Boxline

here = Path(__file__).resolve().parent
out = Path(os.environ.get("OUTPUT_DIR", "output"))
env = {
    "PLACE": os.environ.get("PLACE", "Bath, United Kingdom"),
    "KIND": os.environ.get("KIND", "amenity=cafe"),
    "LIMIT": os.environ.get("LIMIT", "20"),
    "NOMINATIM_URL": os.environ.get("NOMINATIM_URL", "https://nominatim.openstreetmap.org/search"),
    "OVERPASS_URL": os.environ.get("OVERPASS_URL", "https://overpass-api.de/api/interpreter"),
}
enrich = min(int(os.environ.get("ENRICH", "5")), 10)
bx = Boxline()

with bx.sessions.create(browser=False, shell=True, timeout=300, idle_timeout=120, user_metadata={"example": "local-businesses"}) as session:
    print(f"Session: {session.id}", flush=True)
    session.files.write("osm.py", (here.parent / "osm.py").read_bytes())
    r = session.exec("python osm.py", env=env, timeout_ms=120_000)
    if r["exitCode"] != 0:
        raise SystemExit(f"osm.py failed: {(r['stderr'] or r['stdout']).strip()}")
    print(r["stdout"].strip())
    osm = json.loads(session.files.read_text("businesses.json"))

# What each offers, from its own website (the first ENRICH that list one).
sites = [b for b in osm["businesses"] if b["website"] and re.match(r"^https?://", b["website"])][:enrich]
model_usd, about = 0.0, {}
if sites:
    r = bx.extract(
        urls=[b["website"] for b in sites],
        prompt="Each page is a local business's website. description: what it offers, one plain sentence. specialities: up to 3 things it is known for, a few words each. url: the page's address as given.",
        schema={"type": "object", "properties": {"sites": {"type": "array", "items": {"type": "object", "properties": {"url": {"type": "string"}, "description": {"type": "string"}, "specialities": {"type": "array", "items": {"type": "string"}}}, "required": ["url", "description", "specialities"]}}}, "required": ["sites"]},
    )
    model_usd = r["usage"]["costUsd"]
    for i, s in enumerate(r["data"]["sites"]):
        url = next((b["website"] for b in sites if b["website"] == s["url"]), sites[i]["website"] if i < len(sites) else s["url"])
        about[url] = {"description": s["description"], "specialities": s["specialities"]}
businesses = [{**b, **about.get(b["website"] or "", {"description": None, "specialities": []})} for b in osm["businesses"]]

for b in businesses:
    print(f"  {b['name']}" + (f", {b['address']}" if b["address"] else "") + (f"  {b['website']}" if b["website"] else "") + (f"\n      {b['description']}" if b["description"] else ""))
print(f"\n{osm['attribution']}")
out.mkdir(parents=True, exist_ok=True)
cols = ["name", "address", "website", "phone", "openingHours", "description", "lat", "lon", "osm"]
with open(out / "businesses.csv", "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(cols)
    for b in businesses:
        w.writerow(["" if b[c] is None else b[c] for c in cols])
    f.write(f"\n# {osm['attribution']}\n")
(out / "result.json").write_text(json.dumps({"place": osm["place"], "bbox": osm["bbox"], "kind": osm["kind"], "businesses": businesses, "attribution": osm["attribution"], "usage": {"modelUsd": model_usd}}, indent=2, ensure_ascii=False))
