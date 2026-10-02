"""Runs in the session's shell: finds the businesses of one kind in a place from OpenStreetMap, through its official
services (Nominatim to find the place, Overpass to query it), following their usage policies: an identifying
User-Agent, one request at a time, small queries. Inputs: PLACE, KIND (an OSM tag such as amenity=cafe), LIMIT,
NOMINATIM_URL and OVERPASS_URL. Writes /workspace/businesses.json."""
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

UA = {"user-agent": "local-businesses (a Boxline example; https://boxline.dev)"}
place = os.environ.get("PLACE", "Bath, United Kingdom")
key, _, value = os.environ.get("KIND", "amenity=cafe").partition("=")
limit = int(os.environ.get("LIMIT", "20"))
nominatim = os.environ.get("NOMINATIM_URL", "https://nominatim.openstreetmap.org/search")
overpass = os.environ.get("OVERPASS_URL", "https://overpass-api.de/api/interpreter")


def get(url, data=None):
    """One request; the public servers are shared, so a busy answer (429, 5xx) or a timeout is retried after a pause."""
    for attempt, pause in enumerate([5, 15, 0]):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, data=data, headers=UA), timeout=60) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code not in (429, 502, 503, 504) or not pause:
                raise SystemExit(f"{url} answered {e.code}: {e.read()[:200].decode('utf-8', 'replace')}")
        except (urllib.error.URLError, TimeoutError) as e:
            if not pause:
                raise SystemExit(f"{url} did not answer: {e}")
        print(f"  {url} is busy; trying again in {pause} s")
        time.sleep(pause)


# 1. Where the place is: its bounding box.
hits = get(f"{nominatim}?{urllib.parse.urlencode({'q': place, 'format': 'json', 'limit': 1})}")
if not hits:
    raise SystemExit(f"OpenStreetMap does not know {place!r}")
south, north, west, east = (float(x) for x in hits[0]["boundingbox"])
time.sleep(1)  # Nominatim's policy: at most one request per second

# 2. The businesses of that kind inside it (nodes, ways and relations; a way's centre as its location).
query = f'[out:json][timeout:25];nwr["{key}"="{value}"]["name"]({south},{west},{north},{east});out center tags {limit * 2};'
data = get(overpass, urllib.parse.urlencode({"data": query}).encode())
found = []
for el in data.get("elements", []):
    t = el.get("tags", {})
    address = " ".join(x for x in [t.get("addr:housenumber"), t.get("addr:street")] if x)
    found.append({
        "osm": f"https://www.openstreetmap.org/{el['type']}/{el['id']}",
        "name": t.get("name"),
        "address": ", ".join(x for x in [address, t.get("addr:postcode"), t.get("addr:city")] if x) or None,
        "lat": el.get("lat") or el.get("center", {}).get("lat"),
        "lon": el.get("lon") or el.get("center", {}).get("lon"),
        "website": t.get("website") or t.get("contact:website"),
        "phone": t.get("phone") or t.get("contact:phone"),
        "openingHours": t.get("opening_hours"),
    })
found = sorted(found, key=lambda b: (b["website"] is None, b["name"] or ""))[:limit]
json.dump({"place": hits[0].get("display_name", place), "bbox": [south, north, west, east], "kind": f"{key}={value}", "businesses": found, "attribution": "Data © OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright)"}, open("/workspace/businesses.json", "w"), indent=1)
print(f"{len(found)} {key}={value} in {hits[0].get('display_name', place)}")
