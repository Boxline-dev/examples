import { check, expect, result } from "../runner/check-lib.js";

check(() => {
  const r = result();
  expect(r.rows?.length >= 2, `${r.rows?.length ?? 0} countries, not at least 2`);
  for (const row of r.rows) {
    expect(row.seenFrom === row.country, `the ${row.country} request came from ${row.seenFrom}: the proxy did not exit there`);
    expect(typeof row.price === "number" && row.price > 0 && row.currency, `${row.country}: no price (${JSON.stringify(row)})`);
  }
  return r.rows.map((x: any) => `${x.country}: ${x.shown} (seen from ${x.seenFrom})`).join("; ");
});
