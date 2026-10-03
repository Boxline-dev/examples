/**
 * Hand over for a code: the AI signs in with your username and a password kept as a credential, and when the
 * site asks for a code sent by SMS (or an app), it pauses and asks you for it, then carries on.
 *
 *   SIGNIN_URL=https://… SITE_USERNAME=… SITE_PASSWORD=… npx tsx node/index.ts     (BOXLINE_API_KEY)
 *
 * The password goes into the credential SIGNIN_PASSWORD, a secret (SECRET_NAME picks another name), limited to the
 * sign-in site; after that SITE_PASSWORD is not needed (set the credential in the console instead, if you like). The run
 * names the credential, and the model only ever sees %username% and %SIGNIN_PASSWORD%. Writes output/result.json.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { Boxline, CredentialExistsError } from "@boxline/sdk";

const out = process.env.OUTPUT_DIR ?? "output";
const signin = process.env.SIGNIN_URL;
const username = process.env.SITE_USERNAME;
const secretName = process.env.SECRET_NAME ?? "SIGNIN_PASSWORD";
if (!signin || !username) throw new Error("Set SIGNIN_URL and SITE_USERNAME (and SITE_PASSWORD the first time)");
const bx = new Boxline();

// The password as a credential (a secret): stored sealed, never shown again, and typed only into fields on the sign-in site.
let secretCreated = false;
if (process.env.SITE_PASSWORD) {
  const origins = [new URL(signin).origin];
  try {
    await bx.credentials.create({ name: secretName, type: "secret", value: process.env.SITE_PASSWORD, origins, description: `Password for ${new URL(signin).host}` });
    secretCreated = true;
  } catch (err) {
    if (!(err instanceof CredentialExistsError)) throw err;
    await bx.credentials.update(secretName, { value: process.env.SITE_PASSWORD, origins });
  }
}
console.log(`Credential ${secretName}: ${JSON.stringify(await bx.credentials.get(secretName).then(({ origins, scope }) => ({ origins, scope })))}`);

const run = await bx.agent.run({
  task:
    `Open ${signin} and sign in with the username %username% and the password %${secretName}%. When the site asks for a ` +
    "verification code, ask me for it with ask_user_for_help and wait; then type the code I give you. When I'm signed in, " +
    "tell me the name shown on the page.",
  variables: { username },
  credentials: [secretName], // the model sees %SIGNIN_PASSWORD%; the platform types the value
  maxSteps: 25,
});
console.log(`Agent run ${run.id} (${run.provider}/${run.model}) · Session: ${run.sessionId}`);

const rl = createInterface({ input: process.stdin, output: process.stdout });
let handovers = 0;
for await (const e of bx.agent.stream(run.id)) {
  if (e.type === "tool") console.log(`→ ${e.name} ${JSON.stringify(e.input ?? {}).slice(0, 100)}`); // placeholders, never values
  else if (e.type === "handover" && e.by === "agent") {
    handovers++;
    console.log(`\nThe AI asks: ${e.text}`);
    const code = await rl.question("Type the code the site sent you: ");
    await bx.agent.handBack(run.id, `The verification code is ${code.trim()}`);
  } else if (e.type === "done") console.log(`\n${e.status}: ${e.result ?? e.error}`);
}
rl.close();

const done = await bx.agent.get(run.id);
mkdirSync(out, { recursive: true });
writeFileSync(
  join(out, "result.json"),
  JSON.stringify(
    { signinUrl: signin, secret: secretName, agentRuns: [{ id: run.id }], status: done.status, answer: done.result, handovers, steps: done.steps.length, model: done.model, made: { credentials: secretCreated ? [secretName] : [] } },
    null,
    2,
  ),
);
