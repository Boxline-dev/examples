/**
 * CAPTCHA hand-over: open a form behind a CAPTCHA, see the platform detect it, have a person solve it in the live
 * view, then carry on and submit the form. Only on sites you own or may automate (the Acceptable Use Policy).
 *
 *   FORM_URL=https://… npx tsx node/index.ts     (BOXLINE_API_KEY; NAME to type into the form's name field)
 *
 * The session's `captcha: "ask"` (the default) means: when a CAPTCHA waits for a person, say so and wait; nothing is
 * solved automatically. Writes output/result.json.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Boxline } from "@boxline/sdk";

const out = process.env.OUTPUT_DIR ?? "output";
const formUrl = process.env.FORM_URL;
if (!formUrl) throw new Error("Set FORM_URL to a form of your own site that shows a CAPTCHA");
const name = process.env.NAME ?? "Ada Lovelace";
const bx = new Boxline();

const session = await bx.sessions.create({ captcha: "ask", keepAlive: true, timeout: 600, userMetadata: { example: "captcha-hand-over" } });
console.log(`Session: ${session.id}`);
let detected = false;
const stop = session.onCaptcha(
  ({ state, kind, url }) => {
    if (state === "detected") {
      detected = true;
      console.log(`\nA CAPTCHA (${kind}) is waiting for a person on ${url}: solve it in the live view (the link works like a password):\n  ${session.liveUrl}\n`);
    } else console.log(`The CAPTCHA (${kind}) was solved.`);
  },
  { intervalMs: 1000 },
);
try {
  await session.goto(formUrl);
  // The platform looks twice, about 2 s apart, before it says a CAPTCHA waits for a person.
  const deadline = Date.now() + 30_000;
  while (!(await session.refresh()).data.attention && Date.now() < deadline) await new Promise((r) => setTimeout(r, 1000));
  const attention = session.data.attention;
  if (attention) await session.waitForHuman({ timeoutMs: 5 * 60_000 }); // throws CaptchaTimeoutError if nobody solves it
  stop();

  await session.fill('input[name="name"]', name);
  await session.click('form [type="submit"], form button');
  await session.wait(1000);
  const { title, content } = await session.content("text");
  console.log(`After submitting: "${title}": ${content.replace(/\s+/g, " ").slice(0, 120)}`);

  const events = (await session.events({ types: ["captcha"] })).data.map((e) => ({ state: e.data?.state, kind: e.data?.kind, waitedMs: e.data?.waitedMs ?? null }));
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "result.json"), JSON.stringify({ formUrl, attention, detected, events, title, pageSays: content.slice(0, 600) }, null, 2));
} finally {
  stop();
  await session.release();
}
