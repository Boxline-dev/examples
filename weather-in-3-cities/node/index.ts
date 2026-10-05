/**
 * Weather in 3 cities: open the same weather page through residential proxies in three cities, with the browser in
 * "realistic" mode (its clock and language follow the proxy), and compare the local weather and time.
 *
 *   npx tsx node/index.ts            (BOXLINE_API_KEY; a plan with residential proxies and the realistic browser)
 *
 * wttr.in picks the weather for the place the request comes from. Proxy traffic counts against the plan's allowance.
 * Writes output/result.json.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Boxline } from "@boxline/sdk";

const out = process.env.OUTPUT_DIR ?? "output";
const CITIES = [
  { name: "New York", country: "US", city: "new_york" },
  { name: "London", country: "GB", city: "london" },
  { name: "Tokyo", country: "JP", city: "tokyo" },
];
const bx = new Boxline();

const rows = [];
for (const c of CITIES) {
  const session = await bx.sessions.create({
    timeout: 300,
    proxy: { type: "residential", country: c.country, city: c.city },
    browser: { mode: "realistic" },
    userMetadata: { example: "weather-in-3-cities" },
  });
  console.log(`Session: ${session.id} (${c.name})`);
  try {
    await session.goto("https://wttr.in/?format=j1");
    const { content } = await session.content("text");
    // Chrome shows JSON as text (with its own "Pretty-print" control around it): parse from the first { to the last }.
    const w = JSON.parse(content.slice(content.indexOf("{"), content.lastIndexOf("}") + 1)) as { current_condition: any[]; nearest_area: any[] };
    const clock = await session.evaluate<{ time: string; timeZone: string; language: string }>(
      "({ time: new Date().toString(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, language: navigator.language })",
    );
    const now = w.current_condition[0];
    const area = w.nearest_area[0];
    rows.push({
      city: c.name,
      area: `${area.areaName[0].value}, ${area.country[0].value}`,
      tempC: Number(now.temp_C),
      weather: now.weatherDesc[0].value,
      ...clock,
    });
    console.log(`${c.name}: ${area.areaName[0].value}, ${now.temp_C} °C, ${now.weatherDesc[0].value}; the browser's clock: ${clock.time} (${clock.timeZone}, ${clock.language})`);
  } finally {
    await session.stop();
  }
}

mkdirSync(out, { recursive: true });
writeFileSync(join(out, "result.json"), JSON.stringify({ rows }, null, 2));
