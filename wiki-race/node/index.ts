/**
 * Wiki race: an agent gets from one Wikipedia article to another by clicking links only. The example does not take
 * its word for the route: it reads the pages the browser really visited from the session's log and checks every hop
 * with Wikipedia's API in the session's shell, then works out whether a shorter route existed.
 *
 *   npx tsx node/index.ts            (BOXLINE_API_KEY; START_URL, TARGET; a plan with shell sessions and agent runs)
 *
 * Writes output/result.json and output/route.md.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Boxline } from "@boxline/sdk";

const here = dirname(fileURLToPath(import.meta.url));
const out = process.env.OUTPUT_DIR ?? "output";
const startUrl = process.env.START_URL ?? "https://en.wikipedia.org/wiki/Coffee";
const target = process.env.TARGET ?? "Moon";
const bx = new Boxline();

const session = await bx.sessions.create({ shell: true, timeout: 900, idleTimeout: 300, userMetadata: { example: "wiki-race" } });
console.log(`Session: ${session.id}`);
try {
  const page = await session.goto(startUrl);
  console.log(`Start: ${page.title} → target: ${target}`);

  // 1. The race: links only.
  const started = await bx.agent.run({
    sessionId: session.id,
    task:
      `You are on the Wikipedia article at ${startUrl}. Get to the article "${target}" by clicking links in the ` +
      `articles' text, in as few clicks as you can. Rules: do not use the search box, do not type or change addresses ` +
      `(no navigating to a URL), stay on this wiki. Going back from a dead end is allowed. When the "${target}" article ` +
      `is open, finish with the titles of the articles you went through, in order.`,
    maxSteps: 30,
    output: {
      type: "object",
      properties: { reached: { type: "boolean" }, path: { type: "array", items: { type: "string" } } },
      required: ["reached", "path"],
    },
  });
  console.log(`Agent run ${started.id} (${started.model}) is racing…`);
  const run = await bx.agent.wait<{ reached: boolean; path: string[] }>(started.id);
  if (run.status !== "completed" || !run.result) throw new Error(`the run ${run.status}: ${run.error ?? "no result"}`);
  const toolSteps = run.steps.filter((s) => s.type === "tool");
  console.log(`The agent says: ${run.result.path.join(" → ")} (${toolSteps.filter((s) => s.name === "browser_click").length} clicks)`);

  // 2. What the browser really visited, from the session's log, checked hop by hop in the shell.
  const visited: string[] = [];
  for await (const e of session.events({ types: ["navigation"] })) if (e.url && !e.url.startsWith("about:")) visited.push(e.url);
  await session.files.write("path.json", JSON.stringify({ start: startUrl, target, visited }));
  await session.files.write("verify_path.py", readFileSync(join(here, "../verify_path.py")));
  const v = await session.exec("python3 verify_path.py path.json", { cwd: "/workspace", timeoutMs: 300_000 });
  if (v.exitCode !== 0) throw new Error(`verify_path.py failed: ${v.stderr.trim().split("\n").at(-1)}`);
  const verified = JSON.parse(v.stdout);

  const marks = verified.hops.map((h: any) => `${h.from} ${h.linked ? "→" : "⇢ (not a link!)"} `).join("") + (verified.route.at(-1) ?? "");
  const short = verified.shortest.hops === 3 ? "3 or more" : `${verified.shortest.hops}${verified.shortest.via.length ? ` (e.g. via ${verified.shortest.via[0]})` : ""}`;
  console.log(`Route: ${marks}\n${verified.reached ? "Reached" : "Did not reach"} "${verified.target}" in ${verified.hops.length} hops; ${verified.allLinked ? "every hop is a link on the page" : "some hops are not links"}; shortest possible: ${short} (${verified.apiCalls} API calls)`);

  mkdirSync(out, { recursive: true });
  writeFileSync(
    join(out, "route.md"),
    [`# ${verified.start} → ${verified.target}`, "", ...verified.hops.map((h: any, i: number) => `${i + 1}. ${h.from} → ${h.to}${h.linked ? "" : " (not a link on the page)"}`), "", `Shortest possible: ${short}.`, ""].join("\n"),
  );
  writeFileSync(
    join(out, "result.json"),
    JSON.stringify({ startUrl, target, agent: run.result, visited, verified, toolSteps: toolSteps.map((s) => s.name), agentRuns: [{ id: run.id }] }, null, 2),
  );
} finally {
  await session.stop();
}
