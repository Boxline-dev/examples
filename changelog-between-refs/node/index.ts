/**
 * Changelog between refs: clone a repository into a session's shell, list the commits between two tags (or any two
 * refs), and let an agent in that session write the changelog from the history itself (git log, git show), grouped
 * for readers, every line citing its commits. The code checks that each cited commit is in the range.
 *
 *   npx tsx node/index.ts            (BOXLINE_API_KEY; REPO_URL, FROM, TO; a plan with shell sessions)
 *
 * Writes output/CHANGELOG.md and output/result.json.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Boxline } from "@boxline/sdk";

const out = process.env.OUTPUT_DIR ?? "output";
const env = { REPO_URL: process.env.REPO_URL ?? "https://github.com/expressjs/cors.git", FROM: process.env.FROM ?? "v2.8.4", TO: process.env.TO ?? "v2.8.5" };
const bx = new Boxline();

type Changelog = { summary: string; sections: { title: string; items: { text: string; commits: string[] }[] }[] };

const session = await bx.sessions.create({ browser: false, shell: true, timeout: 900, idleTimeout: 300, userMetadata: { example: "changelog-between-refs" } });
console.log(`Session: ${session.id}`);
let log: { sha: string; subject: string; date: string }[] = [];
let changelog!: Changelog;
let runId = "";
try {
  // 1. The repository and the commits in the range (the refs as variables, never pasted into the command).
  const r = await session.exec(
    'git clone --quiet "$REPO_URL" repo && cd repo && git log --no-merges --format="%h%x09%ad%x09%s" --date=short "$FROM..$TO" && echo "---" && git diff --shortstat "$FROM" "$TO"',
    { env, timeoutMs: 300_000 },
  );
  if (r.exitCode !== 0) throw new Error(`git failed: ${r.stderr.trim()}`);
  const [commits, stat] = r.stdout.split("\n---\n");
  log = commits!.split("\n").filter(Boolean).map((l) => {
    const [sha, date, subject] = l.split("\t");
    return { sha: sha!, date: date!, subject: subject! };
  });
  console.log(`${env.REPO_URL} ${env.FROM}..${env.TO}: ${log.length} commits, ${stat?.trim()}`);
  if (!log.length) throw new Error(`no commits between ${env.FROM} and ${env.TO}`);

  // 2. The changelog, written by an agent that reads the history in the shell (no browser in this session).
  const started = await bx.agent.run({
    sessionId: session.id,
    maxSteps: 20,
    task:
      `The repository is cloned in /workspace/repo. Write the changelog for the changes from ${env.FROM} to ${env.TO} (git log ${env.FROM}..${env.TO}; ` +
      `use git show to understand a commit when its subject is unclear). For users of the project: group into sections such as Added, Fixed, Changed, ` +
      `Documentation; leave out what does not affect them (dependency bumps, chores, CI) unless it matters. Each item: one plain sentence, and the ` +
      `short hashes of its commits. summary: one sentence on what the release brings. Do not change the repository and do not write files: answer only in your output.`,
    output: {
      type: "object",
      properties: {
        summary: { type: "string" },
        sections: { type: "array", items: { type: "object", properties: { title: { type: "string" }, items: { type: "array", items: { type: "object", properties: { text: { type: "string" }, commits: { type: "array", items: { type: "string" } } }, required: ["text", "commits"] } } }, required: ["title", "items"] } },
      },
      required: ["summary", "sections"],
    },
  });
  console.log(`Agent run ${started.id} (${started.model}) is reading the history…`);
  runId = started.id;
  const run = await bx.agent.wait<Changelog>(started.id);
  if (run.status !== "completed" || !run.result) throw new Error(`the run ${run.status}: ${run.error ?? "no answer"}`);
  changelog = run.result;
} finally {
  await session.stop();
}

// 3. An item without commits is not part of the release notes (it is kept apart); every cited commit must be one of
//    the range's (a short hash may be longer or shorter than git's).
const uncited = changelog.sections.flatMap((s) => s.items.filter((i) => !i.commits.length).map((i) => i.text));
changelog.sections = changelog.sections.map((s) => ({ ...s, items: s.items.filter((i) => i.commits.length) })).filter((s) => s.items.length);
const inRange = (c: string) => log.some((l) => l.sha.startsWith(c.slice(0, 7)) || c.startsWith(l.sha));
const unknown = changelog.sections.flatMap((s) => s.items.flatMap((i) => i.commits.filter((c) => !inRange(c))));
const cited = new Set(changelog.sections.flatMap((s) => s.items.flatMap((i) => i.commits.map((c) => log.find((l) => l.sha.startsWith(c.slice(0, 7)) || c.startsWith(l.sha))?.sha)).filter(Boolean)));
const md = [`## ${env.TO}`, "", changelog.summary, "", ...changelog.sections.flatMap((s) => [`### ${s.title}`, "", ...s.items.map((i) => `- ${i.text} (${i.commits.join(", ")})`), ""])].join("\n");
console.log(`\n${md}`);
console.log(`${cited.size} of ${log.length} commits cited${unknown.length ? `; not in the range: ${unknown.join(", ")}` : "; every cited commit is in the range"}${uncited.length ? `; left out (no commits): ${uncited.join(" | ")}` : ""}`);
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "CHANGELOG.md"), md);
writeFileSync(join(out, "result.json"), JSON.stringify({ ...env, commits: log, changelog, cited: [...cited], unknownCommits: unknown, uncited, agentRuns: [{ id: runId }] }, null, 2));
