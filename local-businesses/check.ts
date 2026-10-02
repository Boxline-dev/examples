import { readFileSync } from "node:fs";
import { check, expect, file, result, site } from "../runner/check-lib.js";

check(() => {
  const r = result();
  expect(r.businesses?.length > 0 && /OpenStreetMap contributors/.test(r.attribution), "no businesses, or the OSM attribution is missing");
  expect(readFileSync(file("businesses.csv"), "utf8").includes("OpenStreetMap contributors"), "businesses.csv lacks the OSM attribution");
  const [s, n, w, e] = r.bbox;
  for (const b of r.businesses) expect(b.name && b.lat >= s && b.lat <= n && b.lon >= w && b.lon <= e && /openstreetmap\.org\/(node|way|relation)\//.test(b.osm), `a business outside the place or without its OSM link: ${JSON.stringify(b)}`);
  const st = site();
  if (!st) return `${r.businesses.length} × ${r.kind} in ${r.place}; ${r.businesses.filter((b: any) => b.description).length} described from their websites`;
  // The stand-in: three cafés; two websites say what they offer, one café has none.
  const by = (name: string) => r.businesses.find((b: any) => b.name === name);
  expect(r.businesses.length === 3, `3 cafés expected, got ${r.businesses.length}`);
  expect(/sourdough/i.test(by("Rosie's Kitchen")?.description ?? ""), `Rosie's Kitchen bakes sourdough: ${by("Rosie's Kitchen")?.description}`);
  expect(/pour-over|single-origin|roast/i.test(by("The Beanery")?.description ?? ""), `The Beanery roasts single-origin pour-over: ${by("The Beanery")?.description}`);
  expect(by("Corner Cup") && by("Corner Cup").website === null && by("Corner Cup").description === null, "Corner Cup has no website, so no description");
  expect(by("The Beanery").address === "88 Walcot Street, Bath", `the address comes from OSM's tags: ${by("The Beanery").address}`);
  return `3 cafés from OSM with addresses; Rosie's Kitchen (sourdough) and The Beanery (pour-over) described from their sites; Corner Cup has none; attribution kept`;
});
