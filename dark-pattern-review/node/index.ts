/**
 * Dark pattern review, in two parts:
 * 1. An agent goes through a sign-up or checkout flow, stops before anything is bought or sent, and points out
 *    confusing or deceptive steps. The default is saucedemo.com, a demo shop made for testing.
 * 2. A page scan: each page the agent went through (or PAGES) is measured in the browser (boxes ticked in advance,
 *    countdowns that start again on reload, fees no earlier page showed, small print, pop-up wording), and a model sorts what it finds
 *    into categories. Every pattern quotes the page; a quote that is not on the page is set aside, not reported.
 *
 *   npx tsx node/index.ts            (BOXLINE_API_KEY; TASK to review your own flow; PAGES, comma-separated, to scan)
 *
 * Writes output/review.md, output/patterns.md and output/result.json.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Boxline } from "@boxline/sdk";

const out = process.env.OUTPUT_DIR ?? "output";
const task =
  process.env.TASK ??
  "Open https://www.saucedemo.com, a demo shop made for testing, and sign in with the demo username and password shown on " +
    "its page. Add one product to the cart and go through the checkout up to the last step before the order is placed, " +
    "using the name Test User and the postcode 10115. Don't place the order. For each step, tell me if anything is " +
    "confusing or deceptive: hidden costs, pre-ticked options, fake urgency, or a hard way back.";
const pagesToScan = (process.env.PAGES ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const scanJs = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../scan.js"), "utf8");
const bx = new Boxline();

const CATEGORIES = ["urgency", "scarcity", "sneaking", "hidden_costs", "confirmshaming", "forced_continuity", "obstruction", "misdirection", "forced_action"];
const PATTERNS = {
  type: "object",
  properties: {
    patterns: {
      type: "array",
      items: {
        type: "object",
        properties: {
          category: {
            type: "string",
            enum: CATEGORIES,
            description:
              "urgency: time pressure (countdowns, 'ends tonight'); scarcity: low-stock or high-demand claims; sneaking: something added or ticked for the visitor in advance; hidden_costs: fees shown late or only in the total; confirmshaming: a 'no' worded to shame; forced_continuity: a trial or plan that renews and charges unless cancelled; obstruction: hard to cancel, leave or say no; misdirection: misleading buttons or design that hides the real choice; forced_action: a sign-up, share or other unrelated step required to go on",
          },
          name: { type: "string", description: "a few words, e.g. 'countdown that restarts'" },
          quote: { type: "string", description: "the exact words on the page that show it, copied as written" },
          why: { type: "string", description: "one sentence: why it misleads or pressures" },
        },
        required: ["category", "name", "quote", "why"],
      },
    },
  },
  required: ["patterns"],
};
interface Pattern {
  category: string;
  name: string;
  quote: string;
  why: string;
}
interface Measures {
  url: string;
  title: string;
  text: string;
  preChecked: { label: string }[];
  timers: { id: string | null; text: string; context: string; restartsOnReload?: boolean }[];
  smallPrint: { text: string; fontSize: number }[];
  dialogs: { text: string; choices: string[] }[];
  charges: string[];
  prices: string[];
  lateCharges?: string[];
}
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9$€£.%]+/g, " ").trim();
const seconds = (clock: string) => clock.split(":").reduce((a, n) => a * 60 + Number(n), 0);
const amounts = (s: string) => (s.match(/\d[\d,]*\.\d{2}/g) ?? []).map((a) => a.replace(/,/g, ""));

const session = await bx.sessions.create({ timeout: 1200, userMetadata: { example: "dark-pattern-review" } });
console.log(`Session: ${session.id}`);
try {
  // 1. The agent's walk through the flow, in this session (so the scan sees the same signed-in pages).
  const run = await bx.agent.run({ task, sessionId: session.id, maxSteps: 40 });
  console.log(`Agent run ${run.id} (${run.provider}/${run.model})`);
  for await (const e of bx.agent.stream(run.id)) {
    if (e.type === "tool") console.log(`→ ${e.name} ${JSON.stringify(e.input ?? {}).slice(0, 90)}`);
    else if (e.type === "done") console.log(`\n${e.status}:\n${e.result ?? e.error}`);
  }
  const done = await bx.agent.get(run.id);
  let modelUsd = done.usage.costUsd ?? 0;
  // Every page the agent was on, from its tool calls and what they reported back.
  const steps = JSON.stringify(done.steps.map((s) => [s.input, s.output]));
  const pages = [...new Set((steps.match(/https?:\/\/[^\s"'\\)]+/g) ?? []).map((u) => u.replace(/[.,]+$/, "")))];

  // 2. The page scan: the pages given, else the agent's pages (never the one after an order is placed).
  const host = pages.length ? new URL(pages[0]!).host : "";
  const targets = pagesToScan.length ? pagesToScan : pages.filter((u) => new URL(u).host === host && !/complete|confirm|thank/i.test(u)).slice(-4);
  const scans = [];
  const seenAmounts = new Set<string>(); // every amount on the pages scanned before this one
  for (const url of targets) {
    await session.goto(url);
    const t0 = Date.now();
    const first = await session.evaluate<Measures>(scanJs);
    if (first.timers.length) {
      // A real countdown keeps going while we wait; a fake one starts again when the page is loaded again.
      await new Promise((r) => setTimeout(r, 3000));
      await session.goto(url);
      const elapsed = (Date.now() - t0) / 1000;
      const again = await session.evaluate<Measures>(scanJs);
      first.timers.forEach((t, i) => {
        const later = again.timers[i];
        if (later && /\d:\d\d/.test(t.text) && /\d:\d\d/.test(later.text)) t.restartsOnReload = seconds(t.text) - seconds(later.text) < elapsed - 2;
      });
    }
    // A fee whose amount no earlier page showed was added late (drip pricing).
    if (scans.length) first.lateCharges = first.charges.filter((c) => amounts(c).some((a) => !seenAmounts.has(a)));
    for (const a of amounts(first.text)) seenAmounts.add(a);
    const { text: pageText, ...facts } = first;
    const r = await session.extract<{ patterns: Pattern[] }>(
      "Find the dark patterns on this page: design that pushes or tricks a visitor (false urgency or scarcity, options ticked in advance, " +
        "costs shown late, guilt-tripping wording on a 'no', renewals in small print, a hard way out, misleading buttons, forced sign-ups). " +
        "Report only what the page clearly shows, each with the exact words from the page. These measurements were taken in the browser (lateCharges: fees that no earlier page of the flow showed): " +
        JSON.stringify(facts).slice(0, 4000),
      { schema: PATTERNS },
    );
    modelUsd += r.usage.costUsd ?? 0;
    const page = norm(pageText);
    const verified = r.data.patterns.filter((p) => p.quote && page.includes(norm(p.quote)));
    const unverified = r.data.patterns.filter((p) => !verified.includes(p));
    scans.push({ url, measured: facts, patterns: verified, unverified });
    console.log(`\n${url}: ${verified.length} patterns${unverified.length ? ` (${unverified.length} set aside: quote not on the page)` : ""}`);
    for (const p of verified) console.log(`  ${p.category}: ${p.name}. "${p.quote}"`);
  }

  const md = scans.flatMap((s) => [`## ${s.url}`, "", ...(s.patterns.length ? s.patterns.map((p) => `- **${p.category}**: ${p.name}. "${p.quote}". ${p.why}`) : ["Nothing found."]), ""]);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "review.md"), `${done.result ?? ""}\n`);
  writeFileSync(join(out, "patterns.md"), `${md.join("\n")}\n`);
  writeFileSync(
    join(out, "result.json"),
    JSON.stringify({ task, status: done.status, review: done.result, pages, steps: done.steps.length, scans, agentRuns: [{ id: run.id }], model: done.model, usage: { modelUsd } }, null, 2),
  );
} finally {
  await session.stop();
}
