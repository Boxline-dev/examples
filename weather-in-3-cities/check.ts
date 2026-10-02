import { check, expect, result } from "../runner/check-lib.js";

const WANT: Record<string, { zone: RegExp; country: RegExp }> = {
  "New York": { zone: /^America\/New_York$/, country: /United States/i },
  London: { zone: /^Europe\/London$/, country: /United Kingdom|England/i },
  Tokyo: { zone: /^Asia\/Tokyo$/, country: /Japan/i },
};

check(() => {
  const r = result();
  expect(r.rows?.length === 3, `${r.rows?.length ?? 0} cities, not 3`);
  for (const row of r.rows) {
    const want = WANT[row.city]!;
    expect(want.zone.test(row.timeZone), `${row.city}: the browser's time zone is ${row.timeZone} (realistic mode should follow the proxy)`);
    expect(want.country.test(row.area), `${row.city}: wttr.in placed the request in ${row.area}`);
    expect(Number.isFinite(row.tempC) && row.weather, `${row.city}: no weather`);
  }
  return r.rows.map((x: any) => `${x.city}: ${x.tempC} °C ${x.weather}, ${x.timeZone}`).join("; ");
});
