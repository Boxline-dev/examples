/**
 * Test my staging site: clone your repository in the session's shell, run its tests against your staging site, and
 * open every page that failed in the session's browser for a screenshot.
 *
 *   REPO_URL=… STAGING_URL=… npx tsx node/index.ts     (BOXLINE_API_KEY; TEST_COMMAND, default "npm test")
 *
 * The tests get STAGING_URL in their environment. Pages that failed are the staging addresses the test output names.
 * Writes output/result.json and output/failures/N.png.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Boxline } from "@boxline/sdk";

const out = process.env.OUTPUT_DIR ?? "output";
const repo = process.env.REPO_URL;
const staging = process.env.STAGING_URL;
const testCommand = process.env.TEST_COMMAND ?? "npm test";
if (!repo || !staging) throw new Error("Set REPO_URL (a repository you may clone) and STAGING_URL (the site its tests should check)");
const bx = new Boxline();
const shown = (u: string) => u.replace(/\/\/[^/@]*@/, "//"); // never print a token that is part of the address

const session = await bx.sessions.create({ shell: true, timeout: 900, userMetadata: { example: "test-my-staging-site" } });
console.log(`Session: ${session.id}`);
try {
  // 1. The shell: clone, install, test. Addresses go in as environment variables, never into the command text.
  const env = { REPO_URL: repo, STAGING_URL: staging };
  // A shallow clone where the server offers it (plain-HTTP servers do not), else a full one.
  const clone = await session.exec('rm -rf app && { git clone --quiet --depth 1 "$REPO_URL" app 2>/dev/null || git clone --quiet "$REPO_URL" app; }', { env, timeoutMs: 180_000 });
  if (clone.exitCode !== 0) throw new Error(`git clone failed: ${clone.stderr.trim()}`);
  console.log(`Cloned ${shown(repo)}`);
  const install = await session.exec("[ -f package.json ] && npm install --no-audit --no-fund --silent || true", { cwd: "app", timeoutMs: 600_000 });
  if (install.exitCode !== 0) console.log(`npm install: ${install.stderr.trim()}`);
  console.log(`Running "${testCommand}" against ${staging}`);
  const tests = await session.exec(testCommand, { cwd: "app", env, timeoutMs: 600_000 });
  const output = `${tests.stdout}\n${tests.stderr}`;
  const count = (what: string) => Number(new RegExp(`^\\s*(?:#|ℹ)\\s*${what}\\s+(\\d+)`, "m").exec(output)?.[1] ?? NaN);
  console.log(`Tests ${tests.exitCode === 0 ? "passed" : `failed (exit ${tests.exitCode})`}: ${count("pass")} passed, ${count("fail")} failed`);

  // 2. The browser: open each staging page the failures name, and screenshot it.
  const esc = staging.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const urls = [...new Set([...output.matchAll(new RegExp(`${esc}[^\\s"'<>)\\]]*`, "g"))].map((m) => m[0].replace(/[.,:;]+$/, "")))];
  mkdirSync(join(out, "failures"), { recursive: true });
  const failures: { url: string; status: number | null; title: string; screenshot: string }[] = [];
  for (const [i, url] of urls.entries()) {
    const page = await session.goto(url);
    const shot = await session.screenshot();
    const file = `failures/${i + 1}.png`;
    writeFileSync(join(out, file), Buffer.from(shot.data, "base64"));
    failures.push({ url, status: page.status, title: page.title, screenshot: file });
    console.log(`  failed: ${url} (HTTP ${page.status}, "${page.title}") → output/${file}`);
  }

  writeFileSync(
    join(out, "result.json"),
    JSON.stringify({ repo: shown(repo), staging, command: testCommand, exitCode: tests.exitCode, passed: count("pass"), failed: count("fail"), failures, outputTail: output.trim().slice(-3000) }, null, 2),
  );
} finally {
  await session.release();
}
