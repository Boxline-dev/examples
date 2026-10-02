/**
 * Two-factor sign-in: keep a site's sign-in details on a saved login once (user name, password and the 2FA setup key),
 * then an agent run signs in with %login.username%, %login.password% and %login.otp%: the platform makes the current
 * 6-digit code at the moment it is typed. The model never sees any of them, and they are typed only on that site.
 *
 *   SIGNIN_URL=https://… SITE_USERNAME=… SITE_PASSWORD=… SITE_TOTP_SECRET=… npx tsx node/index.ts   (BOXLINE_API_KEY)
 *
 * SITE_TOTP_SECRET is the "setup key" the site shows when you turn on an authenticator app (or its otpauth:// link).
 * With CONTEXT_ID of a saved login that already has details, the three are not needed. Needs a plan with saved login
 * details (loginDetails). Writes output/result.json.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Boxline } from "@boxline/sdk";

const out = process.env.OUTPUT_DIR ?? "output";
const signin = process.env.SIGNIN_URL;
if (!signin) throw new Error("Set SIGNIN_URL to the site's sign-in page");
const bx = new Boxline();

// 1. The saved login and its details (sealed on the platform; only whether they are there is ever shown again).
let contextId = process.env.CONTEXT_ID;
let made = false;
if (!contextId) {
  contextId = (await bx.contexts.create({ name: `${new URL(signin).host} (two-factor example)` })).id;
  made = true;
}
if (process.env.SITE_PASSWORD) {
  const { SITE_USERNAME: username, SITE_PASSWORD: password, SITE_TOTP_SECRET: totpSecret } = process.env;
  if (!username || !totpSecret) throw new Error("Set SITE_USERNAME and SITE_TOTP_SECRET with SITE_PASSWORD");
  await bx.contexts.setLogin(contextId, { origin: new URL(signin).origin, username, password, totpSecret });
}
const saved = await bx.contexts.get(contextId);
if (!saved.login?.hasPassword) throw new Error(`saved login ${contextId} has no sign-in details: set SITE_USERNAME, SITE_PASSWORD and SITE_TOTP_SECRET`);
console.log(`Saved login ${contextId}: ${saved.login.username} on ${saved.login.origin}, 2FA ${saved.login.hasTotp ? "on" : "off"}`);

// 2. An agent run in a session started from the saved login: it types the details where the site asks for them.
const run = await bx.agent.run({
  task:
    `Open ${signin} and sign in: type %login.username% as the email or user name and %login.password% as the password. ` +
    "When the site asks for a verification code from an authenticator app, type %login.otp%. Then tell me the name shown on the page.",
  context: { id: contextId },
  maxSteps: 20,
});
console.log(`Agent run ${run.id} (${run.provider}/${run.model}) · Session: ${run.sessionId}`);
for await (const e of bx.agent.stream(run.id)) {
  if (e.type === "tool") console.log(`→ ${e.name} ${JSON.stringify(e.input ?? {}).slice(0, 100)}`); // placeholders only
  else if (e.type === "done") console.log(`\n${e.status}: ${e.result ?? e.error}`);
}

const done = await bx.agent.get(run.id);
mkdirSync(out, { recursive: true });
writeFileSync(
  join(out, "result.json"),
  JSON.stringify(
    { signinUrl: signin, contextId, login: saved.login, agentRuns: [{ id: run.id }], status: done.status, answer: done.result, steps: done.steps.length, made: { contexts: made ? [contextId] : [] } },
    null,
    2,
  ),
);
