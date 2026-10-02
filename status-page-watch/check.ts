import { bytes, check, expect, isPng, result, site } from "../runner/check-lib.js";

check(() => {
  const r = result();
  expect(r.rounds?.length >= 1 && r.rounds[0].pages.every((p: any) => p.overall !== "unknown" && p.changes.length === 0), `the first round should read every page as a baseline: ${JSON.stringify(r.rounds?.[0])}`);
  const st = site();
  if (!st) return `${r.pages.length} status pages read: ${r.rounds[0].pages.map((p: any) => p.overall).join(", ")}`;
  // The stand-in: in round 2 Acme's webhooks degrade and an incident opens; the other page only changes its timestamp.
  expect(r.rounds.length === 2, `2 rounds expected, got ${r.rounds.length}`);
  const [acme, widgets] = r.rounds[1].pages;
  const text = acme.changes.join(" | ");
  expect(/webhooks: operational → degraded/i.test(text), `the degraded webhooks are not reported: ${text}`);
  expect(/new incident: delayed webhook deliveries/i.test(text), `the new incident is not reported: ${text}`);
  expect(acme.overall === "partial_outage", `Acme's overall state should be partial_outage, got ${acme.overall}`);
  expect(acme.screenshot && isPng(bytes(acme.screenshot)), "no screenshot of the changed page");
  expect(widgets.changes.length === 0, `the Widgets page only changed its timestamp, yet: ${widgets.changes.join(" | ")}`);
  const posted = st.records.chat as { text: string }[];
  expect(posted.length === 1 && /Delayed webhook deliveries/.test(posted[0]!.text) && r.alertsSent === 1, `one alert should reach the chat, got ${posted.length}`);
  return `round 2: ${text}; screenshot saved; the other page (timestamp only) quiet; 1 alert posted`;
});
