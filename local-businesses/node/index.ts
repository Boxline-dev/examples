/**
 * Local businesses: list the businesses of one kind in a place (cafés in Bath, bike shops in Utrecht…) from
 * OpenStreetMap's open data, then read the websites they list to say what each offers. A list for finding a place,
 * a supplier or a venue, with OSM's attribution.
 *
 *   npx tsx node/index.ts            (BOXLINE_API_KEY; PLACE, KIND (an OSM tag), LIMIT, ENRICH; a plan with shell sessions)
 *
 * osm.py queries OpenStreetMap from the session's shell (Nominatim and Overpass, within their usage policies); one
 * extract reads the businesses' own websites. Writes output/businesses.csv, output/result.json.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Boxline } from "@boxline/sdk";

const here = dirname(fileURLToPath(import.meta.url));
const out = process.env.OUTPUT_DIR ?? "output";
const env = {
  PLACE: process.env.PLACE ?? "Bath, United Kingdom",
  KIND: process.env.KIND ?? "amenity=cafe",
  LIMIT: process.env.LIMIT ?? "20",
  NOMINATIM_URL: process.env.NOMINATIM_URL ?? "https://nominatim.openstreetmap.org/search",
  OVERPASS_URL: process.env.OVERPASS_URL ?? "https://overpass-api.de/api/interpreter",
};
const enrich = Math.min(Number(process.env.ENRICH ?? 5), 10);
const bx = new Boxline();

type Business = { osm: string; name: string; address: string | null; lat: number; lon: number; website: string | null; phone: string | null; openingHours: string | null };
const session = await bx.sessions.create({ browser: false, shell: true, timeout: 300, idleTimeout: 120, userMetadata: { example: "local-businesses" } });
console.log(`Session: ${session.id}`);
let osm: { place: string; bbox: number[]; kind: string; businesses: Business[]; attribution: string };
try {
  await session.files.write("osm.py", readFileSync(join(here, "../osm.py")));
  const r = await session.exec("python osm.py", { env, timeoutMs: 120_000 });
  if (r.exitCode !== 0) throw new Error(`osm.py failed: ${(r.stderr || r.stdout).trim()}`);
  console.log(r.stdout.trim());
  osm = JSON.parse(await session.files.readText("businesses.json"));
} finally {
  await session.stop();
}

// What each offers, from its own website (the first ENRICH that list one).
const sites = osm.businesses.filter((b) => b.website && /^https?:\/\//.test(b.website)).slice(0, enrich);
let modelUsd = 0;
const about = new Map<string, { description: string; specialities: string[] }>();
if (sites.length) {
  const r = await bx.extract<{ sites: { url: string; description: string; specialities: string[] }[] }>({
    urls: sites.map((b) => b.website!),
    prompt: "Each page is a local business's website. description: what it offers, one plain sentence. specialities: up to 3 things it is known for, a few words each. url: the page's address as given.",
    schema: { type: "object", properties: { sites: { type: "array", items: { type: "object", properties: { url: { type: "string" }, description: { type: "string" }, specialities: { type: "array", items: { type: "string" } } }, required: ["url", "description", "specialities"] } } }, required: ["sites"] },
  });
  modelUsd = r.usage.costUsd;
  r.data.sites.forEach((s, i) => about.set(sites.find((b) => b.website === s.url)?.website ?? sites[i]!.website!, { description: s.description, specialities: s.specialities }));
}
const businesses = osm.businesses.map((b) => ({ ...b, ...(b.website && about.has(b.website) ? about.get(b.website)! : { description: null, specialities: [] as string[] }) }));

for (const b of businesses) console.log(`  ${b.name}${b.address ? `, ${b.address}` : ""}${b.website ? `  ${b.website}` : ""}${b.description ? `\n      ${b.description}` : ""}`);
console.log(`\n${osm.attribution}`);
const cols = ["name", "address", "website", "phone", "openingHours", "description", "lat", "lon", "osm"] as const;
const cell = (v: unknown) => (v === null || v === undefined ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "businesses.csv"), [cols.join(","), ...businesses.map((b) => cols.map((c) => cell(b[c])).join(",")), "", `# ${osm.attribution}`].join("\n") + "\n");
writeFileSync(join(out, "result.json"), JSON.stringify({ place: osm.place, bbox: osm.bbox, kind: osm.kind, businesses, attribution: osm.attribution, usage: { modelUsd } }, null, 2));
