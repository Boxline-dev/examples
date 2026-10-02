import { check, expect, readJson, result, site } from "../runner/check-lib.js";

check(() => {
  const r = result();
  const c = readJson("company.json");
  expect(c.legalName && c.address && c.foundOn, `company.json is incomplete: ${JSON.stringify(c)}`);
  const standIn = site();
  if (standIn) {
    const want = standIn.expected.company;
    expect(c.legalName === want.name, `legal name "${c.legalName}", not "${want.name}"`);
    expect(/1 High Street/.test(c.address) && /CB1 1AA/.test(c.address), `address "${c.address}"`);
    expect(/\/company\/privacy/.test(c.foundOn), `found on ${c.foundOn}, not the privacy notice`);
    expect(!r.read.some((u: string) => /\/company\/blog/.test(u)), "the blog was read as a legal page");
  } else if (/eff\.org/.test(r.site)) {
    expect(/Electronic Frontier Foundation/i.test(c.legalName) && /San Francisco/i.test(c.address), `EFF's name or address is wrong: ${JSON.stringify(c)}`);
  }
  return `${c.legalName}, ${c.address} (from ${c.foundOn.replace(/^https?:\/\/[^/]+/, "")}); read ${r.read.length} legal pages, not the blog`;
});
