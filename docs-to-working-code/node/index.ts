/**
 * Docs to working code: an agent reads an HTTP API's documentation in the session's browser, writes a Python client
 * for a goal in the session's shell, runs it and fixes it until it works. Then the example runs the script itself, so
 * what you get is code that has been run, with its real output.
 *
 *   npx tsx node/index.ts            (BOXLINE_API_KEY; DOCS_URL, GOAL; a plan with shell sessions and agent runs)
 *
 * Writes output/client.py, output/client-output.json and output/result.json.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Boxline } from "@boxline/sdk";

const out = process.env.OUTPUT_DIR ?? "output";
const docsUrl = process.env.DOCS_URL ?? "https://frankfurter.dev/";
const goal =
  process.env.GOAL ??
  "Print as JSON the euro's reference rates for USD, GBP and JPY on 2026-10-01, and for each the percent change since 2026-09-01 (rounded to 2 decimals).";
const bx = new Boxline();

const session = await bx.sessions.create({ shell: true, timeout: 900, idleTimeout: 300, userMetadata: { example: "docs-to-working-code" } });
console.log(`Session: ${session.id}`);
try {
  // 1. The docs open in the browser (pages built by JavaScript work too); the agent reads them there.
  const page = await session.goto(docsUrl);
  console.log(`Docs: ${page.title} (${docsUrl})`);

  // 2. The agent writes the client in the same session's shell and runs it until it works.
  const started = await bx.agent.run({
    sessionId: session.id,
    task:
      `The documentation of an HTTP API is open in the browser (${docsUrl}). Read it there: scroll, and follow its links ` +
      `if the part you need is on another page. Then write a Python 3 script, /workspace/client.py (the requests package ` +
      `is installed), that does this:\n\n${goal}\n\nThe script prints exactly one JSON document to stdout and nothing ` +
      `else. Take addresses, keys and parameters from the documentation. Run it with \`python3 /workspace/client.py\`, ` +
      `check its output against the goal, and fix it until it is right. Finish with the endpoints it calls and two ` +
      `sentences on what it does.`,
    maxSteps: 30,
    output: {
      type: "object",
      properties: { endpoints: { type: "array", items: { type: "string" } }, summary: { type: "string" } },
      required: ["endpoints", "summary"],
    },
  });
  console.log(`Agent run ${started.id} (${started.model}) is reading the docs and writing the client…`);
  const run = await bx.agent.wait<{ endpoints: string[]; summary: string }>(started.id);
  if (run.status !== "completed" || !run.result) throw new Error(`the run ${run.status}: ${run.error ?? "no result"}`);
  const toolSteps = run.steps.filter((s) => s.type === "tool");
  console.log(`${toolSteps.length} tool steps: ${run.result.summary}`);

  // 3. The example runs the script itself (from /workspace: the agent's last `cd` would carry over otherwise).
  const ran = await session.exec("python3 client.py", { cwd: "/workspace", timeoutMs: 120_000 });
  let output: unknown = null;
  try {
    output = JSON.parse(ran.stdout);
  } catch {
    /* not JSON: the check says so */
  }
  console.log(`Ran client.py: exit ${ran.exitCode}${output === null ? ", output is not JSON" : ""}\n${ran.stdout.trim().slice(0, 1500)}`);

  mkdirSync(out, { recursive: true });
  const script = await session.files.readText("client.py");
  writeFileSync(join(out, "client.py"), script);
  writeFileSync(join(out, "client-output.json"), ran.stdout);
  writeFileSync(
    join(out, "result.json"),
    JSON.stringify(
      {
        docsUrl,
        goal,
        agent: run.result,
        run: { exitCode: ran.exitCode, stderr: ran.stderr.slice(-2000), output },
        scriptLines: script.trim().split("\n").length,
        toolSteps: toolSteps.map((s) => ({ name: s.name, input: JSON.stringify(s.input ?? {}).slice(0, 300) })),
        agentRuns: [{ id: run.id }],
      },
      null,
      2,
    ),
  );
} finally {
  await session.stop();
}
