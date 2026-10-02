/**
 * Status page watch: read the official status pages of the services you depend on, in one shape whatever their
 * format (overall state, components, open incidents), and post to your chat when something changes: a component
 * degraded or back, an incident opened or resolved. Each alert comes with a screenshot of the page.
 *
 *   npx tsx node/index.ts            (BOXLINE_API_KEY; PAGES comma-separated, SLACK_WEBHOOK_URL; RUNS, INTERVAL_SECONDS)
 *
 * The last state of each page is kept in STATE_DIR between runs (run it from cron for a schedule). Writes
 * output/result.json, output/alerts.md and output/<page>-<round>.png for each change.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Boxline } from "@boxline/sdk";

const out = process.env.OUTPUT_DIR ?? "output";
const stateDir = process.env.STATE_DIR ?? join(out, "state");
const pages = (process.env.PAGES ?? "https://www.githubstatus.com/,https://status.npmjs.org/").split(",").map((u) => u.trim()).filter(Boolean).slice(0, 10);
const runs = Number(process.env.RUNS ?? 1);
const interval = Number(process.env.INTERVAL_SECONDS ?? 300);
const chatHook = process.env.SLACK_WEBHOOK_URL;
const bx = new Boxline();

const LEVELS = ["operational", "degraded", "partial_outage", "major_outage", "maintenance", "unknown"] as const;
type Status = { url: string; service: string; overall: (typeof LEVELS)[number]; components: { name: string; status: (typeof LEVELS)[number] }[]; incidents: { title: string; status: string }[] };
const file = (url: string) => join(stateDir, `${createHash("sha256").update(url).digest("hex").slice(0, 16)}.json`);

/** What changed between two readings of a page, in plain words. */
function changes(a: Status, b: Status): string[] {
  const c: string[] = [];
  if (a.overall !== b.overall) c.push(`overall: ${a.overall} → ${b.overall}`);
  const before = new Map(a.components.map((x) => [x.name.toLowerCase(), x.status]));
  for (const x of b.components) {
    const was = before.get(x.name.toLowerCase());
    if (was && was !== x.status) c.push(`${x.name}: ${was} → ${x.status}`);
  }
  const titles = (s: Status) => new Set(s.incidents.map((i) => i.title.toLowerCase()));
  for (const i of b.incidents) if (!titles(a).has(i.title.toLowerCase())) c.push(`new incident: ${i.title} (${i.status})`);
  for (const i of a.incidents) if (!titles(b).has(i.title.toLowerCase())) c.push(`resolved: ${i.title}`);
  return c;
}

mkdirSync(stateDir, { recursive: true });
mkdirSync(out, { recursive: true });
const rounds: { round: number; at: string; pages: { url: string; overall: string; changes: string[]; screenshot?: string }[] }[] = [];
let alertsSent = 0;
let modelUsd = 0;
for (let round = 1; round <= runs; round++) {
  const at = new Date().toISOString();
  // Every page in one call, read into the same shape (status words mapped onto a fixed scale).
  const r = await bx.extract<{ pages: Status[] }>({
    urls: pages,
    prompt:
      "Each page is a service's status page. service: its name. overall: the service's current state. components: each component listed with its current state. " +
      "incidents: only incidents that are still open (not resolved), with their title and stage (e.g. investigating, identified, monitoring). Map every state onto: " +
      "operational, degraded (degraded performance), partial_outage, major_outage, maintenance, or unknown. url: the page's address as given.",
    schema: {
      type: "object",
      properties: {
        pages: {
          type: "array",
          items: {
            type: "object",
            properties: {
              url: { type: "string" },
              service: { type: "string" },
              overall: { type: "string", enum: [...LEVELS] },
              components: { type: "array", items: { type: "object", properties: { name: { type: "string" }, status: { type: "string", enum: [...LEVELS] } }, required: ["name", "status"] } },
              incidents: { type: "array", items: { type: "object", properties: { title: { type: "string" }, status: { type: "string" } }, required: ["title", "status"] } },
            },
            required: ["url", "service", "overall", "components", "incidents"],
          },
        },
      },
      required: ["pages"],
    },
  });
  modelUsd += r.usage.costUsd;
  const seen: (typeof rounds)[number]["pages"] = [];
  const alerts: string[] = [];
  for (const [i, url] of pages.entries()) {
    const now = r.data.pages.find((p) => p.url === url) ?? r.data.pages[i];
    if (!now || r.pages[i]?.error) {
      seen.push({ url, overall: "unknown", changes: [`could not be read: ${r.pages[i]?.error?.code ?? "no data"}`] });
      continue;
    }
    const before: Status | null = existsSync(file(url)) ? JSON.parse(readFileSync(file(url), "utf8")) : null;
    const diff = before ? changes(before, now) : [];
    writeFileSync(file(url), JSON.stringify(now, null, 2));
    const row: (typeof seen)[number] = { url, overall: now.overall, changes: diff };
    if (diff.length) {
      // Evidence for the alert: how the page looked when the change was seen.
      const name = `${new URL(url).host.replace(/[^a-z0-9]+/gi, "-")}-${round}.png`;
      writeFileSync(join(out, name), await bx.screenshot(url, { fullPage: true }));
      row.screenshot = name;
      alerts.push(`*${now.service}* is ${now.overall.replace("_", " ")} (${url})\n${diff.map((d) => `• ${d}`).join("\n")}`);
    }
    seen.push(row);
    console.log(`  ${now.overall.padEnd(14)} ${now.service}${diff.map((d) => `\n                 ${d}`).join("")}`);
  }
  rounds.push({ round, at, pages: seen });
  if (alerts.length) {
    const text = `Status changes (${at.slice(0, 16).replace("T", " ")} UTC)\n\n${alerts.join("\n\n")}`;
    writeFileSync(join(out, "alerts.md"), `${existsSync(join(out, "alerts.md")) ? readFileSync(join(out, "alerts.md"), "utf8") + "\n\n" : ""}${text}`);
    if (chatHook) {
      const res = await fetch(chatHook, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
      if (res.ok) alertsSent++;
      console.log(res.ok ? "  posted the changes to the chat webhook" : `  the chat webhook answered ${res.status}`);
    }
  }
  console.log(`Round ${round} done: ${seen.filter((p) => p.changes.length).length} pages changed.`);
  if (round === 1 && seen.some((p) => p.overall !== "unknown")) console.log("Baseline saved.");
  if (round < runs) await new Promise((res) => setTimeout(res, interval * 1000));
}
writeFileSync(join(out, "result.json"), JSON.stringify({ pages, rounds, alertsSent, usage: { modelUsd } }, null, 2));
