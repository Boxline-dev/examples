/**
 * Solve and test: an agent solves a programming exercise in a session's shell and runs the exercise's tests until they
 * pass; then the example runs the tests again itself, from a fresh copy, so the result does not rest on the agent's word.
 * The exercises and their test cases are Exercism's problem-specifications (MIT).
 *
 *   npx tsx node/index.ts            (BOXLINE_API_KEY; EXERCISE, e.g. roman-numerals; a plan with shell sessions)
 *
 * The agent works in a session without a browser: only the shell, in the machine. Writes output/solution.py and
 * output/result.json.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Boxline } from "@boxline/sdk";

const here = dirname(fileURLToPath(import.meta.url));
const out = process.env.OUTPUT_DIR ?? "output";
const exercise = process.env.EXERCISE ?? "roman-numerals";
if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(exercise)) throw new Error(`EXERCISE is a slug like roman-numerals, not "${exercise}"`);
const specs = `https://raw.githubusercontent.com/exercism/problem-specifications/main/exercises/${exercise}`;
const runner = readFileSync(join(here, "../run_tests.py"));
const bx = new Boxline();

// Downloads the exercise into a folder of the workspace (the address as a variable, not inside the command).
const fetchExercise = (dir: string) =>
  `mkdir -p ${dir} && cd ${dir} && curl -sSfL --max-time 60 -o instructions.md "$SPECS/instructions.md" && ` +
  `curl -sSfL --max-time 60 -o canonical-data.json "$SPECS/canonical-data.json" && sha256sum canonical-data.json run_tests.py`;

const session = await bx.sessions.create({ browser: false, shell: true, timeout: 900, idleTimeout: 300, userMetadata: { example: "solve-and-test" } });
console.log(`Session: ${session.id}`);
try {
  // 1. The exercise, its test cases and the test runner go into the machine.
  await session.files.write("exercise/run_tests.py", runner);
  const got = await session.exec(`${fetchExercise("exercise")} && python3 run_tests.py --signatures`, { env: { SPECS: specs }, cwd: "/workspace", timeoutMs: 120_000 });
  if (got.exitCode !== 0) throw new Error(`no exercise "${exercise}": ${got.stderr.trim()}`);
  const lines = got.stdout.trim().split("\n");
  const hashes = lines.slice(0, 2).join("\n");
  const signatures = lines.slice(2);
  console.log(`Exercise ${exercise}: ${signatures.join("; ")}`);

  // 2. An agent solves it in the same session: it reads, writes solution.py, runs the tests, fixes, until all pass.
  const started = await bx.agent.run({
    sessionId: session.id,
    task:
      `In /workspace/exercise, instructions.md describes a programming exercise. Write the solution in Python in ` +
      `/workspace/exercise/solution.py with these functions:\n${signatures.join("\n")}\n` +
      `Run the tests with \`cd /workspace/exercise && python3 run_tests.py\` (it prints JSON with the failed cases) and ` +
      `fix the solution until every test passes. Do not change run_tests.py or canonical-data.json. Use only Python's ` +
      `standard library. When done, report the last test run's numbers and your approach in two sentences.`,
    maxSteps: 25,
    output: {
      type: "object",
      properties: { passed: { type: "integer" }, total: { type: "integer" }, approach: { type: "string" } },
      required: ["passed", "total", "approach"],
    },
  });
  console.log(`Agent run ${started.id} (${started.model}) is solving it…`);
  const run = await bx.agent.wait<{ passed: number; total: number; approach: string }>(started.id);
  if (run.status !== "completed" || !run.result) throw new Error(`the run ${run.status}: ${run.error ?? "no result"}`);
  const toolSteps = run.steps.filter((s) => s.type === "tool");
  console.log(`The agent says ${run.result.passed}/${run.result.total} pass after ${toolSteps.length} tool steps: ${run.result.approach}`);

  // 3. The tests again, run by the example from a fresh download in another folder, with only solution.py copied over.
  //    The agent's copies of the tests are compared with the originals too. (The agent shares the session's shell, so
  //    its last `cd` would carry over: every command here names its folder with `cwd`.)
  await session.files.write("check/run_tests.py", runner);
  const verify = await session.exec(
    `${fetchExercise("check")} >/dev/null && cp ../exercise/solution.py . && ` +
      `(cd ../exercise && sha256sum canonical-data.json run_tests.py) > ../agent-hashes.txt && python3 run_tests.py`,
    { env: { SPECS: specs }, cwd: "/workspace", timeoutMs: 120_000 },
  );
  const last = verify.stdout.trim().split("\n").at(-1) ?? "";
  if (!last.startsWith("{")) throw new Error(`the tests did not run: ${verify.stderr.trim() || "no solution.py"}`);
  const tests = JSON.parse(last);
  const testsChanged = (await session.files.readText("agent-hashes.txt")).trim() !== hashes.trim();
  console.log(`Run again by the example: ${tests.passed}/${tests.total} pass${testsChanged ? " (the agent changed the tests!)" : "; the agent left the tests as they were"}`);

  mkdirSync(out, { recursive: true });
  const solution = await session.files.readText("exercise/solution.py");
  writeFileSync(join(out, "solution.py"), solution);
  writeFileSync(
    join(out, "result.json"),
    JSON.stringify(
      {
        exercise,
        source: specs,
        signatures,
        agent: run.result,
        tests,
        testsChanged,
        solutionLines: solution.trim().split("\n").length,
        toolSteps: toolSteps.map((s) => ({ name: s.name, input: s.input })),
        agentRuns: [{ id: run.id }],
      },
      null,
      2,
    ),
  );
} finally {
  await session.release();
}
