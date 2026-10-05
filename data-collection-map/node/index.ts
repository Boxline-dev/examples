/**
 * Data collection map: what personal data a site's pages ask for and where it goes. For each page: its forms, the
 * kinds of personal data their fields collect (email, phone, birth date, card, …) and where each form sends it (this
 * site or another); and across the visit, the third-party hosts the pages load from (known trackers marked) and the
 * cookies the site sets. A starting point for a privacy review of your own site.
 *
 *   npx tsx node/index.ts            (BOXLINE_API_KEY; SITE_URL, MAX_PAGES, TRACKERS to add host names)
 *
 * forms.js runs in each page; the network log and the cookie export come from the session. Writes output/result.json
 * and output/map.md.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Boxline } from "@boxline/sdk";

const here = dirname(fileURLToPath(import.meta.url));
const out = process.env.OUTPUT_DIR ?? "output";
const start = process.env.SITE_URL ?? "https://books.toscrape.com/";
const maxPages = Number(process.env.MAX_PAGES ?? 5);
const forms = readFileSync(join(here, "../forms.js"), "utf8");
const TRACKERS = ["google-analytics.com", "googletagmanager.com", "doubleclick.net", "facebook.net", "facebook.com", "connect.facebook.net", "segment.io", "segment.com", "hotjar.com", "mixpanel.com", "amplitude.com", "clarity.ms", "tiktok.com", "linkedin.com", "bing.com", "criteo.com", "taboola.com", "hubspot.com", ...(process.env.TRACKERS ?? "").split(",").map((t) => t.trim()).filter(Boolean)];
const bx = new Boxline();

type Form = { action: string; method: string; fields: { name: string; type: string; label: string; autocomplete: string | null; kind: string | null }[]; kinds: string[] };
const site = (host: string) => host.split(".").slice(-2).join(".");
const mine = site(new URL(start).hostname);

const session = await bx.sessions.create({ timeout: 300, userMetadata: { example: "data-collection-map" } });
console.log(`Session: ${session.id}`);
const pages: { url: string; title: string; forms: (Form & { sendsTo: string; thirdParty: boolean })[] }[] = [];
let cookies: { name: string; domain: string; httpOnly: boolean; secure: boolean; thirdParty: boolean }[] = [];
let requests: { host: string; tracker: boolean; requests: number }[] = [];
try {
  // 1. The start page and the pages it links to on the same site, one after the other in the same browser.
  const queue = [start];
  const seen = new Set<string>();
  while (queue.length && pages.length < maxPages) {
    const url = queue.shift()!;
    if (seen.has(url)) continue;
    seen.add(url);
    const opened = await session.goto(url, { waitUntil: "load" }).catch(() => null);
    if (!opened || (opened.status ?? 0) >= 400) continue;
    const found = await session.evaluate<Form[]>(forms);
    pages.push({ url: opened.url, title: opened.title, forms: found.map((f) => ({ ...f, sendsTo: new URL(f.action).host, thirdParty: site(new URL(f.action).hostname) !== mine })) });
    const links = await session.evaluate<string[]>(`[...document.links].map((a) => a.href).filter((h) => /^https?:/.test(h))`);
    for (const l of links) {
      const u = new URL(l);
      u.hash = "";
      if (site(u.hostname) === mine && !seen.has(u.href)) queue.push(u.href);
    }
  }

  // 2. Everything the pages loaded (the session's network log) and the cookies they left.
  await new Promise((r) => setTimeout(r, 1500));
  const hosts = new Map<string, number>();
  for await (const e of session.events({ types: ["network"], limit: 2000 })) {
    try {
      const h = new URL(e.url!).hostname;
      if (site(h) !== mine) hosts.set(h, (hosts.get(h) ?? 0) + 1);
    } catch {
      /* not an address */
    }
  }
  requests = [...hosts].map(([host, n]) => ({ host, tracker: TRACKERS.some((t) => host === t || host.endsWith(`.${t}`)), requests: n })).sort((a, b) => b.requests - a.requests);
  // The cookie jar as a Netscape cookie file (the format curl and wget read): one tab-separated line per cookie.
  const exported = await session.exportCookies();
  cookies = (await session.files.readText(exported.path))
    .split("\n")
    .filter((l) => l.trim() && (!l.startsWith("#") || l.startsWith("#HttpOnly_")))
    .map((l) => {
      const [domain, , , secure, , name] = l.split("\t");
      const httpOnly = domain!.startsWith("#HttpOnly_");
      const host = domain!.replace(/^#HttpOnly_/, "").replace(/^\./, "");
      return { name: name!, domain: host, httpOnly, secure: secure === "TRUE", thirdParty: site(host) !== mine };
    });
} finally {
  await session.stop();
}

const collected = [...new Set(pages.flatMap((p) => p.forms.flatMap((f) => f.kinds)))];
const offsite = pages.flatMap((p) => p.forms.filter((f) => f.thirdParty && f.kinds.length).map((f) => ({ page: p.url, sendsTo: f.sendsTo, kinds: f.kinds })));
console.log(`${pages.length} pages; personal data asked for: ${collected.join(", ") || "none"}`);
for (const p of pages) for (const f of p.forms) console.log(`  ${p.url}\n    form → ${f.method.toUpperCase()} ${f.sendsTo}${f.thirdParty ? " (another site)" : ""}: ${f.kinds.join(", ") || "no personal data"}`);
console.log(`Third-party hosts: ${requests.map((r) => `${r.host}${r.tracker ? " (tracker)" : ""}`).join(", ") || "none"}`);
console.log(`Cookies: ${cookies.map((c) => `${c.name} (${c.domain}${c.httpOnly ? ", HttpOnly" : ""})`).join(", ") || "none"}`);

const md = [
  `# Data collection map: ${start}`,
  "",
  `Personal data asked for: ${collected.join(", ") || "none"}.`,
  ...(offsite.length ? ["", `**Sent to another site:** ${offsite.map((o) => `${o.kinds.join(", ")} → ${o.sendsTo} (from ${o.page})`).join("; ")}`] : []),
  "",
  "## Pages and forms",
  "",
  ...pages.flatMap((p) => [`- ${p.url}`, ...p.forms.map((f) => `  - form → ${f.method.toUpperCase()} ${f.sendsTo}${f.thirdParty ? " **(another site)**" : ""}: ${f.fields.filter((x) => x.type !== "hidden").map((x) => `${x.label || x.name}${x.kind ? ` [${x.kind}]` : ""}`).join(", ")}`)]),
  "",
  "## Third-party hosts",
  "",
  ...(requests.length ? requests.map((r) => `- ${r.host}: ${r.requests} requests${r.tracker ? " (known tracker)" : ""}`) : ["None."]),
  "",
  "## Cookies",
  "",
  ...(cookies.length ? cookies.map((c) => `- ${c.name} (${c.domain}): ${c.httpOnly ? "HttpOnly" : "readable by scripts"}, ${c.secure ? "Secure" : "not Secure"}${c.thirdParty ? ", third party" : ""}`) : ["None."]),
  "",
].join("\n");
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "map.md"), md);
writeFileSync(join(out, "result.json"), JSON.stringify({ start, pages, collected, offsite, thirdParties: requests, cookies }, null, 2));
