/**
 * Save a login once: you sign in by hand in the live view once; the session saves its cookies and local storage into
 * a profile when it ends, and later sessions start from it already signed in.
 *
 *   SIGNIN_URL=https://… CHECK_URL=https://… npx tsx node/index.ts     (BOXLINE_API_KEY; a plan with profiles)
 *
 * CHECK_URL is a page that shows you are signed in (your account page). Writes output/result.json with the saved
 * login's id: pass it as PROFILE_ID to the "my-invoices" example, or to `profile: {id}` in your own sessions.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { Boxline } from "@boxline/sdk";

const out = process.env.OUTPUT_DIR ?? "output";
const signin = process.env.SIGNIN_URL;
if (!signin) throw new Error("Set SIGNIN_URL to your site's sign-in page (and CHECK_URL to a page that shows you are signed in)");
const checkUrl = process.env.CHECK_URL ?? signin;
const name = process.env.LOGIN_NAME ?? `${new URL(signin).host} (saved by the example)`;
const bx = new Boxline();

const saved = await bx.profiles.create({ name });
console.log(`Browser profile ${saved.id} ("${name}")`);

// 1. A session that writes its browser state into the profile when it ends (persist: true). keepAlive: it keeps
//    running while nobody is connected (you, in the live view, come and go).
const first = await bx.sessions.create({ timeout: 900, keepAlive: true, profile: { id: saved.id, persist: true }, userMetadata: { example: "save-a-login" } });
console.log(`Session: ${first.id}`);
try {
  await first.goto(signin);
  console.log(`\nSign in yourself in the live view (the link works like a password: don't share it):\n  ${first.liveUrl}\n`);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  await rl.question("Sign in in the live view, then press Enter when you are signed in: ");
  rl.close();
} finally {
  await first.stop(); // ending the session saves the cookies and local storage into the profile
}

// 2. Any later session started from the profile is signed in already (it does not change the profile).
const second = await bx.sessions.create({ timeout: 300, profile: { id: saved.id }, userMetadata: { example: "save-a-login" } });
console.log(`Session: ${second.id}`);
try {
  const page = await second.goto(checkUrl);
  const { content } = await second.content("text");
  console.log(`A new session opened ${page.url} ("${page.title}"): ${content.replace(/\s+/g, " ").slice(0, 120)}`);
  mkdirSync(out, { recursive: true });
  writeFileSync(
    join(out, "result.json"),
    JSON.stringify({ profileId: saved.id, name, signinUrl: signin, checkUrl, sessions: [first.id, second.id], landedOn: page.url, title: page.title, text: content.slice(0, 1000) }, null, 2),
  );
  console.log(`\nBrowser profile: ${saved.id} (start sessions with profile: {id: "${saved.id}"})`);
} finally {
  await second.stop();
}
