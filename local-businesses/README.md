# Local businesses

List the businesses of one kind in a place (cafés in Bath, bike shops in Utrecht, printers in Lyon) from
OpenStreetMap's open data, then read the websites they list to say what each offers. For finding a place to go, a
supplier or a venue.

| | |
|---|---|
| Uses | a shell session (`osm.py`: Nominatim and Overpass), `extract` over the businesses' websites |
| Needs | shell sessions and a model on the API (no keys of your own) |
| Site | OpenStreetMap's official services and the businesses' own websites; the runner uses stand-ins |
| Output | `output/businesses.csv`, `output/result.json` |

OpenStreetMap's services are free and shared: the script identifies itself, makes one request to each, and keeps
queries small, as their usage policies ask. For bigger or repeated jobs, run your own Overpass instance or use an OSM
data extract. The data is © OpenStreetMap contributors under the ODbL: the attribution is in every output, keep it
when you share the list. `KIND` is an OSM tag such as `amenity=cafe`, `shop=bicycle` or `craft=printer`.

**Inputs** (environment variables): `PLACE`, `KIND`, `LIMIT` (default 20), `ENRICH` (websites to read, default 5).

## Run it

Put your API key in the environment (`export BOXLINE_API_KEY=bxl_…`, or copy `.env.example` to `.env` and run
`set -a; . ./.env; set +a`). `BOXLINE_API_URL` points the SDK at another API (default `https://api.boxline.dev`).

Node 18 or newer:

```bash
npm install @boxline/sdk tsx
npx tsx node/index.ts
```

Python 3.9 or newer:

```bash
pip install boxline-sdk
python python/main.py
```

Both write to `output/` (`OUTPUT_DIR` picks another folder).

## The result check

`npx tsx check.ts output` reads what the example wrote and exits with 0 only when the result is right. Every business
has a name, lies inside the place and links to its OSM entry, and the attribution is kept. On the runner's stand-ins:
3 cafés with their addresses from OSM, Rosie's Kitchen (sourdough) and The Beanery (pour-over) described from their
own websites, and Corner Cup, which lists none, left undescribed.
