import { check, expect, result, site } from "../runner/check-lib.js";

check(() => {
  const r = result();
  expect(r.attention?.type === "captcha" && r.attention.kind, `no CAPTCHA was reported on the session: ${JSON.stringify(r.attention)}`);
  const detected = r.events.find((e: any) => e.state === "detected");
  const cleared = r.events.find((e: any) => e.state === "cleared");
  expect(detected && cleared && typeof cleared.waitedMs === "number", `captcha events: ${JSON.stringify(r.events)}`);
  const standIn = site();
  if (standIn) {
    const sent = standIn.records.captcha;
    expect(sent.length === 1 && sent[0].answered && sent[0].name === "Ada Lovelace", `the form received ${JSON.stringify(sent)}`);
    expect(/Account created for Ada Lovelace/.test(r.pageSays), `the page after submitting says: ${r.pageSays.slice(0, 120)}`);
  }
  return `${r.attention.kind} detected ("waiting for a person"), solved in the live view after ${(cleared.waitedMs / 1000).toFixed(1)} s, then the form went through${standIn ? " (the site got the answer and the name)" : ""}`;
});
