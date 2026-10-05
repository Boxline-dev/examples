/**
 * Security headers check: which security headers a site sends, which are missing, and how its cookies are flagged.
 * fetch opens the page in a real browser (final address, status); curl in the session's shell reads the raw headers.
 *
 *   npx tsx node/index.ts            (BOXLINE_API_KEY; SITE_URL for your own site; a plan with shell sessions)
 *
 * Writes output/result.json.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Boxline } from "@boxline/sdk";

const out = process.env.OUTPUT_DIR ?? "output";
const url = process.env.SITE_URL ?? "https://books.toscrape.com/";
const bx = new Boxline();
const FOREIGN_ORIGIN = "https://cors-check.example";

const WANTED: Record<string, string> = {
  "strict-transport-security": "forces HTTPS on later visits",
  "content-security-policy": "limits where scripts, styles and frames come from",
  "x-content-type-options": "stops the browser guessing file types",
  "referrer-policy": "limits what the Referer header gives away",
  "permissions-policy": "switches off browser features the site does not use",
};

// 1. The page in a real browser: where it ends up and with which status.
const page = await bx.fetch(url, { format: "text" });
console.log(`${page.finalUrl} answered ${page.status} ("${page.title}")`);

// 2. The raw headers, from curl in the session's shell (the address goes in as an environment variable, not code).
const session = await bx.sessions.create({ browser: false, shell: true, timeout: 300, userMetadata: { example: "security-headers-check" } });
console.log(`Session: ${session.id}`);
try {
  // A second request says Origin: another site, to see whether the site lets other sites read its answers (CORS).
  const curl = 'curl -sS -o /dev/null -D - -L --max-redirs 5 --max-time 30';
  const [r, cors] = await Promise.all([
    session.exec(`${curl} "$TARGET_URL"`, { env: { TARGET_URL: url } }),
    session.exec(`${curl} -H "Origin: $ORIGIN" "$TARGET_URL"`, { env: { TARGET_URL: url, ORIGIN: FOREIGN_ORIGIN }, shell: false }),
  ]);
  if (r.exitCode !== 0) throw new Error(`curl failed: ${r.stderr.trim()}`);
  const blocks = r.stdout.trim().split(/\r?\n\r?\n/).filter(Boolean);
  // Every hop of the redirect chain: its status and where it sends the browser.
  const redirects = blocks.slice(0, -1).map((b) => ({ status: Number(/^HTTP\/[\d.]+ (\d{3})/.exec(b)?.[1] ?? 0), location: /^location:\s*(.+)$/im.exec(b)?.[1]?.trim() ?? null }));
  const last = blocks.at(-1)!; // after redirects, the final answer
  const lines = last.split(/\r?\n/).slice(1);
  const headers = new Map<string, string>();
  const cookies: { name: string; secure: boolean; httpOnly: boolean; sameSite: string }[] = [];
  for (const line of lines) {
    const i = line.indexOf(":");
    if (i < 0) continue;
    const name = line.slice(0, i).trim().toLowerCase();
    const value = line.slice(i + 1).trim();
    if (name === "set-cookie") {
      cookies.push({
        name: value.split("=")[0]!.trim(),
        secure: /;\s*secure\b/i.test(value),
        httpOnly: /;\s*httponly\b/i.test(value),
        sameSite: /;\s*samesite=(\w+)/i.exec(value)?.[1] ?? "not set",
      });
    } else headers.set(name, value);
  }

  const present = Object.keys(WANTED).filter((h) => headers.has(h));
  const missing = Object.keys(WANTED).filter((h) => !headers.has(h));
  const framing = headers.has("x-frame-options") || /frame-ancestors/i.test(headers.get("content-security-policy") ?? "");
  if (!framing) missing.push("x-frame-options (or CSP frame-ancestors)");
  else present.push(headers.has("x-frame-options") ? "x-frame-options" : "csp frame-ancestors");

  // HSTS in detail: how long browsers must stick to HTTPS, and whether subdomains and the preload list are covered.
  const hstsValue = headers.get("strict-transport-security");
  const hsts = hstsValue
    ? { maxAgeDays: Math.round(Number(/max-age=(\d+)/i.exec(hstsValue)?.[1] ?? 0) / 86400), includeSubDomains: /includesubdomains/i.test(hstsValue), preload: /preload/i.test(hstsValue) }
    : null;
  // CORS: what the site answered to a request from another site.
  const corsHeaders = (cors.stdout.trim().split(/\r?\n\r?\n/).filter(Boolean).at(-1) ?? "").toLowerCase();
  const allowOrigin = /^access-control-allow-origin:\s*(.+)$/m.exec(corsHeaders)?.[1]?.trim() ?? null;
  const allowCredentials = /^access-control-allow-credentials:\s*true/m.test(corsHeaders);
  const corsRisk =
    allowOrigin === FOREIGN_ORIGIN.toLowerCase() && allowCredentials
      ? "it echoes any site's origin and allows credentials: any site can read a signed-in visitor's answers"
      : allowOrigin === FOREIGN_ORIGIN.toLowerCase()
        ? "it echoes any site's origin (fine for public data only)"
        : allowOrigin === "*"
          ? "open to every site (fine for public data)"
          : null;

  for (const hop of redirects) console.log(`  redirect ${hop.status} → ${hop.location}`);
  for (const h of present) console.log(`  ok       ${h}`);
  for (const h of missing) console.log(`  MISSING  ${h}${WANTED[h] ? `: ${WANTED[h]}` : ": stops other sites framing yours (clickjacking)"}`);
  for (const c of cookies) console.log(`  cookie ${c.name}: ${c.secure ? "Secure" : "not Secure"}, ${c.httpOnly ? "HttpOnly" : "readable by scripts"}, SameSite ${c.sameSite}`);
  if (hsts) console.log(`  HSTS: ${hsts.maxAgeDays} days${hsts.includeSubDomains ? ", subdomains" : ""}${hsts.preload ? ", preload" : ""}${hsts.maxAgeDays < 180 ? " (under the 180 days browsers expect)" : ""}`);
  console.log(`  CORS: ${allowOrigin ? `Access-Control-Allow-Origin ${allowOrigin}${allowCredentials ? " with credentials" : ""}` : "not shared with other sites"}${corsRisk ? `: ${corsRisk}` : ""}`);

  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "result.json"), JSON.stringify({ url, finalUrl: page.finalUrl, status: page.status, redirects, present, missing, cookies, hsts, cors: { allowOrigin, allowCredentials, risk: corsRisk } }, null, 2));
} finally {
  await session.stop();
}
