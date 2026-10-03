/**
 * Two-factor sign-in: keep a site's sign-in details as a password credential once (user name, password and the 2FA
 * setup key) and link it to a profile, then an agent run signs in with %NAME.username%, %NAME.password% and %NAME.otp%:
 * the platform makes the current 6-digit code at the moment it is typed. The model never sees any of them, and they
 * are typed only on that site.
 *
 *   SIGNIN_URL=https://… SITE_USERNAME=… SITE_PASSWORD=… SITE_TOTP_SECRET=… npx tsx node/index.ts   (BOXLINE_API_KEY)
 *
 * SITE_TOTP_SECRET is the "setup key" the site shows when you turn on an authenticator app (or its otpauth:// link).
 * CREDENTIAL_NAME picks the credential's name (default TWO_FACTOR_EXAMPLE). With PROFILE_ID of a profile that already
 * links a password credential, the three are not needed. Needs a plan with password credentials (loginDetails). Writes
 * output/result.json.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Boxline, CredentialExistsError } from "@boxline/sdk";

const out = process.env.OUTPUT_DIR ?? "output";
const signin = process.env.SIGNIN_URL;
if (!signin) throw new Error("Set SIGNIN_URL to the site's sign-in page");
const credentialName = process.env.CREDENTIAL_NAME ?? "TWO_FACTOR_EXAMPLE";
const bx = new Boxline();

// 1. The password credential, linked to a profile (sealed on the platform; only whether they are there is ever shown again).
let profileId = process.env.PROFILE_ID;
let made = false;
let credentialMade = false;
if (!profileId) {
  profileId = (await bx.profiles.create({ name: `${new URL(signin).host} (two-factor example)` })).id;
  made = true;
}
if (process.env.SITE_PASSWORD) {
  const { SITE_USERNAME: username, SITE_PASSWORD: password, SITE_TOTP_SECRET: totpSecret } = process.env;
  if (!username || !totpSecret) throw new Error("Set SITE_USERNAME and SITE_TOTP_SECRET with SITE_PASSWORD");
  const origins = [new URL(signin).origin];
  try {
    await bx.credentials.create({ name: credentialName, type: "password", origins, username, password, totpSecret });
    credentialMade = true;
  } catch (err) {
    if (!(err instanceof CredentialExistsError)) throw err;
    await bx.credentials.update(credentialName, { origins, username, password, totpSecret });
  }
  await bx.profiles.update(profileId, { credential: credentialName });
}
const saved = await bx.profiles.get(profileId);
const credential = saved.credential ? await bx.credentials.get(saved.credential) : null;
if (credential?.type !== "password") throw new Error(`profile ${profileId} links no password credential: set SITE_USERNAME, SITE_PASSWORD and SITE_TOTP_SECRET`);
console.log(`Browser profile ${profileId} signs in with ${credential.name}: ${credential.username} on ${credential.origins.join(", ")}, 2FA ${credential.hasTotp ? "on" : "off"}`);

// 2. An agent run in a session started from the profile: the profile's credential is added for you, and the AI types
// its parts where the site asks for them.
const run = await bx.agent.run({
  task:
    `Open ${signin} and sign in: type %${credential.name}.username% as the email or user name and %${credential.name}.password% as the password. ` +
    `When the site asks for a verification code from an authenticator app, type %${credential.name}.otp%. Then tell me the name shown on the page.`,
  profile: { id: profileId },
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
    {
      signinUrl: signin,
      profileId,
      credential: { name: credential.name, username: credential.username, origins: credential.origins, hasTotp: credential.hasTotp },
      agentRuns: [{ id: run.id }],
      status: done.status,
      answer: done.result,
      steps: done.steps.length,
      made: { profiles: made ? [profileId] : [], credentials: credentialMade ? [credentialName] : [] },
    },
    null,
    2,
  ),
);
