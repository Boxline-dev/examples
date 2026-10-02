/**
 * Page resources: open a page in a cloud browser and list everything it loads, from the session's own network log:
 * requests and bytes by type and by domain, the third parties, what failed, and the slowest and heaviest requests.
 *
 *   npx tsx node/index.ts            (BOXLINE_API_KEY; PAGE_URL)
 *
 * Writes output/result.json, output/report.md and output/page.png.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Boxline, type SessionEvent } from "@boxline/sdk";

const out = process.env.OUTPUT_DIR ?? "output";
const url = process.env.PAGE_URL ?? "https://books.toscrape.com/";
const bx = new Boxline();

/** The site a host belongs to, roughly (its last two labels; three for "co.uk"-style endings). */
const site = (host: string) => {
  const parts = host.split(".");
  return parts.slice(/^(co|com|org|net|gov|ac|edu)$/.test(parts.at(-2) ?? "") && parts.length > 2 ? -3 : -2).join(".");
};

const session = await bx.sessions.create({ timeout: 300, userMetadata: { example: "page-resources" } });
console.log(`Session: ${session.id}`);
let requests: SessionEvent[] = [];
try {
  // 1. Load the page until the network is quiet, and keep a picture of it.
  const t0 = Date.now();
  const opened = await session.goto(url, { waitUntil: "networkidle" });
  const loadMs = Date.now() - t0;
  const shot = await session.screenshot({ maxWidth: 1280 });
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "page.png"), Buffer.from(shot.data, "base64"));
  console.log(`${opened.url} (${opened.status}) loaded in ${(loadMs / 1000).toFixed(1)} s`);

  // 2. Its network log: one event per finished (or failed) request. The log is written as requests end: wait a moment.
  await new Promise((r) => setTimeout(r, 1500));
  for await (const e of session.events({ types: ["network"], limit: 2000 })) requests.push(e);
  const mine = site(new URL(opened.url).hostname);
  const rows = requests.map((e) => {
    const host = (() => {
      try {
        return new URL(e.url!).hostname;
      } catch {
        return "?";
      }
    })();
    return { url: e.url!, host, type: e.resourceType ?? "Other", status: e.status ?? null, ms: e.durationMs ?? 0, bytes: Number(e.data?.bytes ?? 0), failed: e.level === "error" || (e.status ?? 0) >= 400, error: e.text ?? null, thirdParty: site(host) !== mine };
  });

  // 3. Grouped and ranked.
  const group = (key: (r: (typeof rows)[number]) => string) => {
    const m = new Map<string, { requests: number; bytes: number }>();
    for (const r of rows) {
      const g = m.get(key(r)) ?? { requests: 0, bytes: 0 };
      g.requests++;
      g.bytes += r.bytes;
      m.set(key(r), g);
    }
    return [...m].map(([name, g]) => ({ name, ...g })).sort((a, b) => b.bytes - a.bytes);
  };
  const byType = group((r) => r.type);
  const byDomain = group((r) => r.host);
  const thirdParties = [...new Set(rows.filter((r) => r.thirdParty).map((r) => r.host))];
  const failed = rows.filter((r) => r.failed).map((r) => ({ url: r.url, status: r.status, error: r.error }));
  const slowest = [...rows].sort((a, b) => b.ms - a.ms).slice(0, 5).map((r) => ({ url: r.url, ms: r.ms }));
  const heaviest = [...rows].sort((a, b) => b.bytes - a.bytes).slice(0, 5).map((r) => ({ url: r.url, kb: Math.round(r.bytes / 102.4) / 10 }));
  const totalKb = Math.round(rows.reduce((n, r) => n + r.bytes, 0) / 102.4) / 10;

  const kb = (b: number) => `${Math.round(b / 102.4) / 10} KB`;
  console.log(`${rows.length} requests, ${totalKb} KB, ${thirdParties.length} third-party hosts, ${failed.length} failed`);
  for (const t of byType) console.log(`  ${t.name.padEnd(12)} ${String(t.requests).padStart(3)}  ${kb(t.bytes)}`);
  if (failed.length) console.log(`Failed: ${failed.map((f) => `${f.url} (${f.status ?? f.error})`).join(", ")}`);
  console.log(`Slowest: ${slowest.slice(0, 3).map((s) => `${s.url} ${s.ms} ms`).join(", ")}`);

  const md = [
    `# ${opened.url}`,
    "",
    `${rows.length} requests, ${totalKb} KB transferred, loaded (network quiet) in ${(loadMs / 1000).toFixed(1)} s.`,
    "",
    "## By type",
    "",
    "| Type | Requests | Transferred |",
    "|---|---|---|",
    ...byType.map((t) => `| ${t.name} | ${t.requests} | ${kb(t.bytes)} |`),
    "",
    "## By domain",
    "",
    "| Domain | Requests | Transferred | Third party |",
    "|---|---|---|---|",
    ...byDomain.map((d) => `| ${d.name} | ${d.requests} | ${kb(d.bytes)} | ${thirdParties.includes(d.name) ? "yes" : ""} |`),
    "",
    `## Failed\n\n${failed.map((f) => `- ${f.url}: ${f.status ?? f.error}`).join("\n") || "None."}`,
    "",
    `## Slowest\n\n${slowest.map((s) => `- ${s.url}: ${s.ms} ms`).join("\n")}`,
    "",
    `## Heaviest\n\n${heaviest.map((h) => `- ${h.url}: ${h.kb} KB`).join("\n")}`,
    "",
    "![The page](page.png)",
    "",
  ].join("\n");
  writeFileSync(join(out, "report.md"), md);
  writeFileSync(join(out, "result.json"), JSON.stringify({ url, finalUrl: opened.url, status: opened.status, loadMs, requests: rows.length, totalKb, byType, byDomain, thirdParties, failed, slowest, heaviest }, null, 2));
} finally {
  await session.release();
}
