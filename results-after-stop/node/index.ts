/**
 * Results after stop: a shell session writes a folder of files and stops. The files are then listed, read and downloaded
 * as one .tar.gz WITHOUT resuming the session: `files.list`, `files.readText` and `files.archive` work on a stopped session
 * (no machine runs, no machine time is billed). Also shown: a shell-only session has no `liveUrl`, and a browser call on
 * it fails with BrowserDisabledError.
 *
 *   npx tsx node/index.ts            (BOXLINE_API_KEY; a plan with shell sessions)
 *
 * Writes output/results.tar.gz and output/result.json.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Boxline, BrowserDisabledError } from "@boxline/sdk";

const out = process.env.OUTPUT_DIR ?? "output";
const bx = new Boxline();

const session = await bx.sessions.create({ browser: false, shell: true, timeout: 600, userMetadata: { example: "results-after-stop" } });
console.log(`Session: ${session.id}`);
try {
  // 1. A shell-only session: no browser, so no live view, and a browser call is refused.
  const shellOnly = { browser: session.data.browser, shell: session.data.shell, liveUrl: session.liveUrl, connectUrl: session.connectUrl };
  const refused = await session.goto("https://example.com").then(
    () => null,
    (e: unknown) => e,
  );
  if (!(refused instanceof BrowserDisabledError)) throw new Error(`a browser call on a shell-only session should be refused, got ${String(refused)}`);
  console.log(`Shell-only session: liveUrl ${shellOnly.liveUrl}; a browser call fails with ${refused.name} (${refused.code}, status ${refused.status})`);

  // 2. Several files go into one folder: some written through the API, some by commands in the machine.
  await session.files.write("results/summary.txt", "Results of the example results-after-stop\n");
  await session.files.write("results/data.csv", ["n,square", ...Array.from({ length: 10 }, (_, k) => `${k + 1},${(k + 1) ** 2}`)].join("\n") + "\n");
  const made = await session.exec(
    'mkdir -p results/logs && python3 -c "import json; print(json.dumps([i * i for i in range(1, 11)]))" > results/squares.json && ' +
      'for i in 1 2 3; do echo "line $i" >> results/logs/run.log; done && echo "outside the folder" > notes.txt',
    { cwd: "/workspace", timeoutMs: 60_000 },
  );
  if (made.exitCode !== 0) throw new Error(`the commands failed: ${made.stderr.trim()}`);

  // 3. The session stops: its workspace is saved and the machine is freed.
  await session.stop();
  console.log(`The session is ${session.status}`);

  // 4. The results, read from the stopped session: no resume.
  const listing = await session.files.list("results");
  console.log(`results/: ${listing.entries.map((e) => `${e.name} (${e.type}, ${e.size} bytes)`).join(", ")}`);
  const summary = await session.files.readText("results/summary.txt");
  const squares = await session.files.readText("results/squares.json");
  const archive = await session.files.archive("results");
  console.log(`results.tar.gz: ${archive.length} bytes`);
  const after = (await bx.sessions.get(session.id)).data.status;
  console.log(`After reading and downloading, the session is still ${after}`);

  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "results.tar.gz"), archive);
  writeFileSync(
    join(out, "result.json"),
    JSON.stringify(
      {
        shellOnly: { ...shellOnly, browserCall: { error: refused.name, code: refused.code, status: refused.status } },
        stoppedStatus: session.status,
        listing: listing.entries.map((e) => ({ name: e.name, type: e.type, size: e.size })),
        read: { "results/summary.txt": summary, "results/squares.json": squares },
        archive: { file: "results.tar.gz", bytes: archive.length },
        statusAfterReads: after,
      },
      null,
      2,
    ),
  );
} finally {
  if (session.status === "RUNNING") await session.stop().catch(() => undefined);
}
