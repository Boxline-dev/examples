import { check, expect, result, site } from "../runner/check-lib.js";

check(() => {
  const r = result();
  expect(r.status && Array.isArray(r.present) && Array.isArray(r.missing), `result.json is incomplete: ${JSON.stringify(r).slice(0, 200)}`);
  expect(r.present.length + r.missing.length === 6, `6 headers should be judged, got ${r.present.length + r.missing.length}`);
  if (!site()) return `${r.finalUrl}: ${r.present.length} present, missing ${r.missing.join(", ") || "none"}; ${r.cookies.length} cookies`;
  const wantMissing = ["strict-transport-security", "content-security-policy", "permissions-policy", "x-frame-options (or CSP frame-ancestors)"];
  expect(wantMissing.every((h) => r.missing.includes(h)), `not every missing header is listed: ${r.missing.join(", ")}`);
  expect(["x-content-type-options", "referrer-policy"].every((h) => r.present.includes(h)), `a header the site sends is not listed as present: ${r.present.join(", ")}`);
  const sid = r.cookies.find((c: any) => c.name === "sid");
  expect(sid && sid.httpOnly === true && sid.secure === false && sid.sameSite === "not set", `cookie sid: ${JSON.stringify(sid)}`);
  expect(r.redirects.length === 1 && r.redirects[0].status === 301 && r.redirects[0].location === "/secure", `the 301 from /secure-start to /secure should be the chain: ${JSON.stringify(r.redirects)}`);
  expect(r.cors.allowCredentials && /credentials/.test(r.cors.risk ?? ""), `the origin echoed with credentials should be flagged: ${JSON.stringify(r.cors)}`);
  return `redirect 301 → /secure; missing: HSTS, CSP, Permissions-Policy, X-Frame-Options; present: X-Content-Type-Options, Referrer-Policy; cookie sid: HttpOnly, not Secure, no SameSite; CORS: any origin echoed with credentials (flagged)`;
});
