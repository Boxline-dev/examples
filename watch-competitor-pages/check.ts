import { check, expect, result, site, size } from "../runner/check-lib.js";

check(() => {
  const r = result();
  expect(Array.isArray(r.rounds) && r.rounds.length >= 1, "no rounds in result.json");
  const first = r.rounds[0];
  expect(first.pages.every((p: any) => p.status === "baseline"), `the first round should save a baseline for every page: ${first.pages.map((p: any) => `${p.url} ${p.status}${p.error ? ` (${p.error})` : ""}`).join("; ")}`);
  const st = site();
  if (!st) return `${r.pages.length} pages watched over ${r.rounds.length} round(s); ${r.rounds.at(-1).pages.filter((p: any) => p.status === "changed").length} changed in the last`;
  // The stand-in: in round 2 the pricing page really changed and the blog only changed its counter.
  expect(r.rounds.length === 2, `2 rounds expected, got ${r.rounds.length}`);
  const [pricing, blog] = r.rounds[1].pages;
  expect(pricing.status === "changed", `the pricing page changed for real but was "${pricing.status}"`);
  const text = pricing.changes.join(" | ");
  expect(/pro/i.test(text) && /\$29/.test(text) && /\$35/.test(text), `the change should say Pro went from $29 to $35: ${text}`);
  expect(/feature added: .*(sso|single sign-on)/i.test(text), `the new SSO feature is not reported: ${text}`);
  expect(pricing.changes.length <= 3, `only 2 things changed on the pricing page, but ${pricing.changes.length} changes were reported: ${text}`);
  expect(blog.status === "noise" || blog.status === "same", `the blog only changed its "readers online" counter, yet it was "${blog.status}": ${blog.changes.join(" | ")}`);
  const posted = st.records.chat as { text: string }[];
  expect(posted.length === 1 && /\$35/.test(posted[0]!.text) && r.alertsSent === 1, `one alert with the new price should reach the chat webhook; it got ${posted.length}`);
  expect(size("alerts.md") > 50, "alerts.md is missing");
  return `round 2: pricing changed (${text}); blog: ${blog.status} (counter only); 1 alert posted to the chat webhook`;
});
