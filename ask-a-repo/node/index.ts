/**
 * Ask a repository: clone a git repository into a session's shell, then let an agent answer questions about it by
 * reading the code (ls, grep, cat, git log), not a web page about it. Every answer names the files it rests on.
 *
 *   npx tsx node/index.ts            (BOXLINE_API_KEY; REPO_URL, QUESTIONS separated by |; a plan with shell sessions)
 *
 * The agent works in a session without a browser: only the shell, in the machine. Writes output/result.json and
 * output/answers.md.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Boxline } from "@boxline/sdk";

const out = process.env.OUTPUT_DIR ?? "output";
const repoUrl = process.env.REPO_URL ?? "https://github.com/expressjs/cors.git";
const questions = (process.env.QUESTIONS ?? "What does this project do, in two sentences?|How do I use it? Show the smallest example.|How are its tests run, and with which test framework?")
  .split("|")
  .map((q) => q.trim())
  .filter(Boolean);
const bx = new Boxline();

type Answers = { answers: { question: string; answer: string; files: string[] }[] };

const session = await bx.sessions.create({ browser: false, shell: true, timeout: 900, idleTimeout: 300, userMetadata: { example: "ask-a-repo" } });
console.log(`Session: ${session.id}`);
try {
  // 1. The repository goes into the machine (the address as a variable, not inside the command); shallow when the
  //    server can (a "dumb" HTTP git server cannot, then all of it).
  const clone = await session.exec('(git clone --depth 1 --quiet "$REPO_URL" repo 2>/dev/null || git clone --quiet "$REPO_URL" repo) && git -C repo log -1 --format="%h %s" && find repo -type f -not -path "*/.git/*" | wc -l', { env: { REPO_URL: repoUrl }, timeoutMs: 180_000 });
  if (clone.exitCode !== 0) throw new Error(`git clone failed: ${clone.stderr.trim()}`);
  const [head, count] = clone.stdout.trim().split("\n");
  console.log(`Cloned ${repoUrl} at ${head} (${count?.trim()} files)`);

  // 2. An agent answers from the code, in the same session (its shell; there is no browser).
  const started = await bx.agent.run({
    sessionId: session.id,
    task:
      `The git repository is checked out in /workspace/repo. Answer these questions from its files only (use the shell: ls, ` +
      `grep, cat, git log). Do not change anything. For each answer list the repository files it rests on, as paths ` +
      `relative to the repository root.\n\n${questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}`,
    maxSteps: 25,
    output: {
      type: "object",
      properties: {
        answers: {
          type: "array",
          items: { type: "object", properties: { question: { type: "string" }, answer: { type: "string" }, files: { type: "array", items: { type: "string" } } }, required: ["question", "answer", "files"] },
        },
      },
      required: ["answers"],
    },
  });
  console.log(`Agent run ${started.id} (${started.model}) is reading the code…`);
  const run = await bx.agent.wait<Answers>(started.id);
  if (run.status !== "completed" || !run.result) throw new Error(`the run ${run.status}: ${run.error ?? "no answer"}`);

  // 3. Every file an answer names must exist in the checkout (the paths go in as a file, never into the command).
  const files = [...new Set(run.result.answers.flatMap((a) => a.files))];
  let missing: string[] = [];
  if (files.length) {
    await session.files.write("cited.txt", files.join("\n") + "\n");
    const listed = await session.exec('cd repo && while IFS= read -r f; do [ -f "$f" ] || echo "$f"; done < ../cited.txt', { timeoutMs: 30_000 });
    missing = listed.stdout.split("\n").filter(Boolean);
  }

  for (const a of run.result.answers) console.log(`\nQ: ${a.question}\nA: ${a.answer}\n   (${a.files.join(", ") || "no files named"})`);
  console.log(`\n${run.steps.filter((s) => s.type === "tool").length} tool steps, $${(run.usage?.costUsd ?? 0).toFixed(4)} of model use${missing.length ? `; files named but not in the repo: ${missing.join(", ")}` : "; every file named exists"}`);

  const md = [`# ${repoUrl}`, "", `At ${head}.`, "", ...run.result.answers.flatMap((a) => [`## ${a.question}`, "", a.answer, "", `Files: ${a.files.map((f) => `\`${f}\``).join(", ") || "none"}`, ""])].join("\n");
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "answers.md"), md);
  writeFileSync(join(out, "result.json"), JSON.stringify({ repoUrl, head, questions, answers: run.result.answers, missingFiles: missing, toolSteps: run.steps.filter((s) => s.type === "tool").map((s) => ({ name: s.name, input: s.input })), agentRuns: [{ id: run.id }] }, null, 2));
} finally {
  await session.release();
}
