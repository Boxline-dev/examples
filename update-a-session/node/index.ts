/**
 * Update a session: a running session gets a longer life and fresh URLs in one call, `session.update({ timeout, rotateUrls })`.
 * The example shows that `expiresAt` moved by the extra time, and that the old connect and live URLs stopped working while
 * the new ones work.
 *
 *   npx tsx node/index.ts            (BOXLINE_API_KEY; a plan whose longest session is 10 minutes or more)
 *
 * Writes output/result.json.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Boxline } from "@boxline/sdk";
import { chromium } from "playwright-core";

const out = process.env.OUTPUT_DIR ?? "output";
const bx = new Boxline();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Connects Playwright to a connect URL; true when it worked. */
async function connects(url: string, timeout: number): Promise<{ ok: true; pages: number } | { ok: false; error: string }> {
  try {
    const browser = await chromium.connectOverCDP(url, { timeout });
    const pages = browser.contexts()[0]?.pages().length ?? 0;
    await browser.close();
    return { ok: true, pages };
  } catch (e) {
    return { ok: false, error: (e instanceof Error ? e.message : String(e)).split("\n")[0]!.slice(0, 160) };
  }
}

/** Tries until an old URL is refused: another API server may take a few seconds to forget it (at most 20 s). */
async function until<T>(attempt: () => Promise<T>, done: (value: T) => boolean) {
  const deadline = Date.now() + 20_000;
  for (let attempts = 1; ; attempts++) {
    const value = await attempt();
    if (done(value) || Date.now() > deadline) return { value, attempts };
    await sleep(2000);
  }
}

// keepAlive: the example connects Playwright and disconnects again; without it a browser-only session stops 5 s after its last client leaves.
const session = await bx.sessions.create({ timeout: 300, keepAlive: true, userMetadata: { example: "update-a-session" } });
console.log(`Session: ${session.id}`);
try {
  const before = { expiresAt: session.data.expiresAt, timeout: session.data.timeout, connectUrl: session.connectUrl!, liveUrl: session.liveUrl! };
  const beforeConnect = await connects(before.connectUrl, 20_000);
  console.log(`Before: the session lasts ${before.timeout} s, until ${before.expiresAt}; its connect URL ${beforeConnect.ok ? "works" : "does not work"}`);

  // One call: a longer life and fresh URLs. The session keeps running; nothing else about it changes.
  await session.update({ timeout: 600, rotateUrls: true });
  const added = (Date.parse(session.data.expiresAt) - Date.parse(before.expiresAt)) / 1000;
  console.log(`After: the session lasts ${session.data.timeout} s, until ${session.data.expiresAt} (${added} s later)`);

  // The old URLs stop working; the new ones work.
  const oldLive = await until(() => fetch(before.liveUrl).then((r) => r.status), (status) => status === 401);
  const newLive = (await fetch(session.liveUrl!)).status;
  const oldConnect = await until(() => connects(before.connectUrl, 8000), (r) => !r.ok);
  const newConnect = await connects(session.connectUrl!, 20_000);
  console.log(`Old live URL: ${oldLive.value} (after ${oldLive.attempts} tries); new live URL: ${newLive}`);
  console.log(`Old connect URL: ${oldConnect.value.ok ? "still works" : `refused (${oldConnect.value.error})`}; new connect URL: ${newConnect.ok ? "works" : "does not work"}`);

  mkdirSync(out, { recursive: true });
  writeFileSync(
    join(out, "result.json"),
    JSON.stringify(
      {
        before: { timeout: before.timeout, expiresAt: before.expiresAt, connectWorked: beforeConnect.ok },
        after: { timeout: session.data.timeout, expiresAt: session.data.expiresAt },
        addedSeconds: added,
        urlsChanged: { connectUrl: session.connectUrl !== before.connectUrl, liveUrl: session.liveUrl !== before.liveUrl },
        oldLive: { status: oldLive.value, tries: oldLive.attempts },
        newLive: { status: newLive },
        oldConnect: { refused: !oldConnect.value.ok, error: oldConnect.value.ok ? null : oldConnect.value.error, tries: oldConnect.attempts },
        newConnect: { connected: newConnect.ok },
      },
      null,
      2,
    ),
  );
} finally {
  await session.stop().catch(() => undefined);
}
