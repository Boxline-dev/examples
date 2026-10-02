import { check, expect, result, site } from "../runner/check-lib.js";

check(() => {
  const r = result();
  expect(r.pages?.length >= 1, "no page was read");
  for (const p of r.pages) for (const f of p.forms) expect(f.action && f.sendsTo && Array.isArray(f.kinds), `a form without its target: ${JSON.stringify(f).slice(0, 120)}`);
  if (!site()) return `${r.pages.length} pages; personal data: ${r.collected.join(", ") || "none"}; ${r.thirdParties.length} third-party hosts (${r.thirdParties.filter((t: any) => t.tracker).length} trackers); ${r.cookies.length} cookies`;
  // The stand-in: a sign-up form, a checkout posting card details to another site, a tracker script, two cookies.
  expect(r.pages.length >= 2, `the checkout page linked from the start should be read too: ${r.pages.map((p: any) => p.url).join(", ")}`);
  for (const k of ["email", "phone", "birth date", "payment card"]) expect(r.collected.includes(k), `"${k}" is not among the data collected: ${r.collected.join(", ")}`);
  expect(r.offsite.some((o: any) => o.sendsTo === "example.com" && o.kinds.includes("payment card")), `card details posted to example.com are not flagged: ${JSON.stringify(r.offsite)}`);
  expect(r.thirdParties.some((t: any) => t.host === "example.com" && t.tracker), `example.com's script (a tracker for this run) is not listed: ${JSON.stringify(r.thirdParties)}`);
  const sid = r.cookies.find((c: any) => c.name === "sid");
  const visit = r.cookies.find((c: any) => c.name === "visit");
  expect(sid?.httpOnly === true && visit && visit.httpOnly === false, `cookies: sid should be HttpOnly, visit readable by scripts: ${JSON.stringify(r.cookies)}`);
  return `email, phone, birth date and card data found; card details go to example.com (flagged); example.com's tracker script listed; cookies sid (HttpOnly) and visit (script)`;
});
