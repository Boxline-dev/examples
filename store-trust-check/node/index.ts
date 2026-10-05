/**
 * Store trust check: before buying from an online store you do not know, gather the signals that separate a real shop
 * from a scam and score them, with every reason shown: who runs it (name, address, phone), its returns and privacy
 * policies, how you can pay, pressure tactics and too-good discounts (read from its pages), how old its domain is
 * (RDAP) and its certificate (openssl), checked in a session's shell.
 *
 *   npx tsx node/index.ts            (BOXLINE_API_KEY; STORE_URLS comma-separated; a plan with shell sessions)
 *
 * It only reads public pages and registry data. Writes output/result.json and output/report.md.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Boxline } from "@boxline/sdk";

const out = process.env.OUTPUT_DIR ?? "output";
const stores = (process.env.STORE_URLS ?? "https://books.toscrape.com/").split(",").map((u) => u.trim()).filter(Boolean);
const bx = new Boxline();

type Facts = {
  business: { name: string | null; address: string | null; phone: string | null; companyNumber: string | null };
  returnsPolicy: { present: boolean; allowsReturns: boolean; window: string | null };
  privacyPolicy: boolean;
  paymentMethods: string[];
  pressureTactics: string[];
  discountClaims: string[];
};
const POLICY = /contact|about|imprint|impressum|legal|return|refund|privacy|terms|shipping|faq/i;

const session = await bx.sessions.create({ browser: false, shell: true, timeout: 600, idleTimeout: 300, userMetadata: { example: "store-trust-check" } });
console.log(`Session: ${session.id}`);
const results: unknown[] = [];
let modelUsd = 0;
try {
  for (const store of stores) {
    const host = new URL(store).hostname;
    const domain = host.split(".").slice(-2).join(".");
    // 1. The domain's registration date (RDAP, the registries' public API) and its certificate, from the machine.
    const rdap = await session.exec(`curl -sL --max-time 20 "https://rdap.org/domain/$DOMAIN" | jq -r '[.events[]? | select(.eventAction=="registration") | .eventDate][0] // empty'`, { env: { DOMAIN: domain }, timeoutMs: 60_000 });
    const registered = rdap.stdout.trim() || null;
    const ageDays = registered ? Math.floor((Date.now() - Date.parse(registered)) / 86_400_000) : null;
    const tls = store.startsWith("https:")
      ? await session.exec(`echo | openssl s_client -connect "$HOST:443" -servername "$HOST" 2>/dev/null | openssl x509 -noout -issuer -enddate 2>/dev/null`, { env: { HOST: host }, timeoutMs: 60_000 })
      : null;
    const issuer = tls?.stdout.match(/issuer=.*?O ?= ?([^,\n]+)/)?.[1]?.trim() ?? null;

    // 2. Its pages: the home page and the policy pages it links to (contact, returns, privacy, terms, …).
    const crawl = await bx.crawl.wait((await bx.crawl.start({ url: store, maxPages: 15, maxDepth: 1, format: "markdown" })).id, { timeoutMs: 5 * 60_000 });
    const policyPages = crawl.data.filter((p) => p.url !== store && !p.error && (p.status ?? 0) < 400 && (POLICY.test(p.url) || POLICY.test(p.title ?? ""))).map((p) => p.finalUrl ?? p.url);
    const r = await bx.extract<Facts>({
      urls: [store, ...policyPages].slice(0, 10),
      prompt:
        "These are an online store's pages. business: who runs it, as stated (null when not stated). returnsPolicy: whether a returns or refund policy is stated, whether it lets buyers return items for a refund, and its window. " +
        "privacyPolicy: whether a privacy policy is stated. paymentMethods: the ways to pay that are named. pressureTactics: countdowns, 'only N left', or similar pressure, quoted. " +
        "discountClaims: discounts stated, quoted. Report only what the pages say.",
      schema: {
        type: "object",
        properties: {
          business: { type: "object", properties: { name: { type: ["string", "null"] }, address: { type: ["string", "null"] }, phone: { type: ["string", "null"] }, companyNumber: { type: ["string", "null"] } }, required: ["name", "address", "phone", "companyNumber"] },
          returnsPolicy: { type: "object", properties: { present: { type: "boolean" }, allowsReturns: { type: "boolean" }, window: { type: ["string", "null"] } }, required: ["present", "allowsReturns", "window"] },
          privacyPolicy: { type: "boolean" },
          paymentMethods: { type: "array", items: { type: "string" } },
          pressureTactics: { type: "array", items: { type: "string" } },
          discountClaims: { type: "array", items: { type: "string" } },
        },
        required: ["business", "returnsPolicy", "privacyPolicy", "paymentMethods", "pressureTactics", "discountClaims"],
      },
    });
    modelUsd += r.usage.costUsd;
    const f = r.data;

    // 3. The score: each warning sign adds points, and says why.
    const signals: { points: number; why: string }[] = [];
    const add = (points: number, why: string) => signals.push({ points, why });
    if (!f.business.address) add(2, "no business address on its pages");
    if (!f.business.phone) add(1, "no phone number");
    if (!f.returnsPolicy.present) add(2, "no returns or refund policy");
    else if (!f.returnsPolicy.allowsReturns) add(2, "the store refuses returns or refunds");
    if (!f.privacyPolicy) add(1, "no privacy policy");
    // Cards and wallets can be disputed with the bank; gift cards, crypto and bank transfers cannot.
    const reversible = f.paymentMethods.some((m) => !/gift/i.test(m) && /card|visa|mastercard|amex|paypal|apple pay|google pay|klarna/i.test(m));
    if (f.paymentMethods.length && !reversible) add(3, `only payments you cannot dispute: ${f.paymentMethods.join(", ")}`);
    if (f.pressureTactics.length) add(2, `pressure tactics: ${f.pressureTactics.join("; ")}`);
    const bigDiscount = f.discountClaims.some((d) => Number(d.match(/(\d{2,3})\s*%/)?.[1] ?? 0) >= 80);
    if (bigDiscount) add(1, `discounts too good to be true: ${f.discountClaims.join("; ")}`);
    if (ageDays !== null && ageDays < 90) add(2, `the domain is ${ageDays} days old`);
    if (!store.startsWith("https:")) add(1, "no HTTPS");
    const score = signals.reduce((n, s) => n + s.points, 0);
    const risk = score >= 6 ? "high" : score >= 3 ? "medium" : "low";
    console.log(`\n${store}: ${risk.toUpperCase()} risk (${score} points)${f.business.name ? `, run by ${f.business.name}` : ""}`);
    for (const s of signals) console.log(`  +${s.points}  ${s.why}`);
    console.log(`  domain registered: ${registered ?? "unknown"}${issuer ? `; certificate from ${issuer}` : ""}; ${policyPages.length} policy pages read`);
    results.push({ store, risk, score, signals, facts: f, domain: { name: domain, registered, ageDays }, certificateIssuer: issuer, pagesRead: [store, ...policyPages].slice(0, 10) });
  }
} finally {
  await session.stop();
}

const md = (results as { store: string; risk: string; score: number; signals: { points: number; why: string }[] }[])
  .map((x) => [`## ${x.store}: ${x.risk} risk (${x.score} points)`, "", ...(x.signals.length ? x.signals.map((s) => `- +${s.points} ${s.why}`) : ["- no warning signs found"]), ""].join("\n"))
  .join("\n");
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "report.md"), `# Store trust check\n\nA score from public signals, not a verdict: check anything that matters yourself.\n\n${md}`);
writeFileSync(join(out, "result.json"), JSON.stringify({ stores: results, usage: { modelUsd } }, null, 2));
