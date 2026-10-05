/**
 * Email-code sign-in: a site that emails a one-time code after the password. The password is a credential with
 * `codeSource: "push"`: an agent run signs in with %NAME.username%, %NAME.password% and %NAME.otp%, and when it reaches
 * the code field it waits. You hear of it (a `code` step in the run, and the webhook `credential.code_needed`), read
 * the email, and send the code with `credentials.pushCode`. The model never sees the password or the code: the
 * platform types them, only on that site.
 *
 *   SIGNIN_URL=https://… SITE_USERNAME=… SITE_PASSWORD=… MAILBOX_URL=https://… npx tsx node/index.ts   (BOXLINE_API_KEY)
 *
 * MAILBOX_URL is where YOUR system reads the site's email: an address that answers `{"messages": [{"text": "...",
 * "receivedAt": "<iso time>"}]}`, newest first (here it is the stand-in site's mailbox, like a mail provider's API).
 * With a real site, change readCode() to read your own mailbox. CREDENTIAL_NAME picks the credential's name (default
 * EMAIL_CODE_EXAMPLE). Needs a plan with password credentials (loginDetails). Writes output/result.json.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { Boxline, CredentialExistsError } from "@boxline/sdk";

const out = process.env.OUTPUT_DIR ?? "output";
const { SIGNIN_URL: signin, SITE_USERNAME: username, SITE_PASSWORD: password, MAILBOX_URL: mailbox } = process.env;
if (!signin || !username || !password || !mailbox) throw new Error("Set SIGNIN_URL, SITE_USERNAME, SITE_PASSWORD and MAILBOX_URL");
const name = process.env.CREDENTIAL_NAME ?? "EMAIL_CODE_EXAMPLE";
const bx = new Boxline();

/** The newest 6-digit code in a message that arrived after `since` (ms): the one function to change for your mailbox. */
async function readCode(since: number): Promise<string> {
  for (let attempt = 0; attempt < 60; attempt++) {
    const { messages } = (await fetch(mailbox!).then((r) => r.json())) as { messages: { text: string; receivedAt: string }[] };
    const mail = messages.find((m) => Date.parse(m.receivedAt) >= since);
    const code = mail?.text.match(/\b(\d{6})\b/)?.[1];
    if (code) return code;
    await sleep(1000);
  }
  throw new Error("no email with a code arrived in the mailbox");
}

// 1. The password as a credential whose codes you send yourself (sealed on the platform; never shown again).
const origins = [new URL(signin).origin];
const fields = { origins, username, password, codeSource: "push" as const, codeTimeoutSeconds: 120 };
let credentialMade = false;
try {
  await bx.credentials.create({ name, type: "password", ...fields });
  credentialMade = true;
} catch (err) {
  if (!(err instanceof CredentialExistsError)) throw err;
  await bx.credentials.update(name, fields);
}

const session = await bx.sessions.create({ timeout: 600, idleTimeout: 300, userMetadata: { example: "email-code-sign-in" } });
console.log(`Session: ${session.id}`);
let result: Record<string, unknown>;
try {
  // 2. The run signs in. At the code field it types %NAME.otp%, and the platform waits for a code that you send.
  const started = Date.now() - 2000;
  const run = await bx.agent.run({
    sessionId: session.id,
    credentials: [name],
    maxSteps: 25,
    task:
      `Open ${signin} and sign in: type %${name}.username% as the email and %${name}.password% as the password, then press Next. ` +
      `The site emails a sign-in code: type %${name}.otp% into the code field and press Verify. Then tell me the name shown on the page.`,
  });
  console.log(`Agent run ${run.id} (${run.provider}/${run.model})`);

  // 3. When the run waits for the code, read the email and send the code. It is used once, by this wait, and the run
  // never holds it.
  let pushedAt: number | null = null;
  for await (const e of bx.agent.stream(run.id)) {
    if (e.type === "tool") console.log(`→ ${e.name} ${JSON.stringify(e.input ?? {}).slice(0, 100)}`); // placeholders only
    else if (e.type === "code" && e.state === "waiting") {
      console.log(`The run waits for the ${e.kind} the site emailed for ${e.credential}: reading the mailbox…`);
      const code = await readCode(started);
      pushedAt = Date.now();
      await bx.credentials.pushCode(name, { code });
      console.log(`Sent the ${code.length}-digit code to ${name}`);
    } else if (e.type === "done") console.log(`\n${e.status}: ${e.result ?? e.error}`);
  }

  const done = await bx.agent.get(run.id);
  const audit: { action: string; kind?: unknown }[] = [];
  for await (const x of bx.credentials.audit({ name })) audit.push({ action: x.action, ...(x.details?.kind ? { kind: x.details.kind } : {}) });
  result = {
    signinUrl: signin,
    credential: name,
    agentRuns: [{ id: run.id }],
    status: done.status,
    answer: done.result,
    steps: done.steps.length,
    // What the run showed while it waited: waiting, then received (never the code).
    codeSteps: done.steps.filter((s) => s.type === "code").map((s) => s.state),
    pushedAt,
    audit,
    made: { credentials: credentialMade ? [name] : [] },
  };
} finally {
  await session.stop();
  if (credentialMade) await bx.credentials.delete(name).catch(() => undefined);
}
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "result.json"), JSON.stringify(result, null, 2));
