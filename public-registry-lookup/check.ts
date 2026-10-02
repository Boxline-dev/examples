import { check, expect, readJson, result } from "../runner/check-lib.js";

check(() => {
  const r = result();
  const rec = readJson("record.json");
  expect(rec.companyNumber && rec.name && rec.status && /^\d{4}-\d{2}-\d{2}$/.test(rec.incorporated), `record.json is incomplete: ${JSON.stringify(rec)}`);
  expect(r.page.endsWith(`/company/${rec.companyNumber}`), `the page ${r.page} is not the record's (${rec.companyNumber})`);
  if (r.company === "ARM LIMITED") {
    expect(rec.companyNumber === "02557590", `company number ${rec.companyNumber}, not 02557590`);
    expect(/active/i.test(rec.status) && rec.incorporated.startsWith("1990-") && /Fulbourn/i.test(rec.registeredOffice), `status, incorporation or address wrong: ${JSON.stringify(rec)}`);
  }
  return `${rec.name}: ${rec.companyNumber}, ${rec.status}, incorporated ${rec.incorporated}, ${rec.registeredOffice.slice(0, 50)} (${r.page.replace(/^https:\/\//, "")})`;
});
