import { check, expect, result, site } from "../runner/check-lib.js";

check(() => {
  const r = result();
  expect(typeof r.profileId === "string" && r.profileId.length > 8, "no profile id");
  expect(r.sessions?.length === 2 && r.sessions[0] !== r.sessions[1], "the check needs a second, new session");
  const standIn = site();
  if (!standIn) return `profile ${r.profileId}; a new session opened ${r.landedOn} ("${r.title}")`;
  const { name } = standIn.expected.login;
  expect(new URL(r.landedOn).pathname === "/account" && r.text.includes(`Signed in as ${name}`), `the new session was not signed in: it landed on ${r.landedOn} ("${r.text.slice(0, 80)}")`);
  const steps = standIn.records.logins.map((l: any) => l.step);
  expect(JSON.stringify(steps) === JSON.stringify(["password ok", "code ok"]), `sign-in steps seen by the site: ${JSON.stringify(steps)} (want one sign-in, by the person)`);
  const views = standIn.records.accountViews;
  expect(views.length >= 2 && views.at(-1).signedIn, `account page views: ${JSON.stringify(views)}`);
  return `signed in once by hand (password, then code); a new session from profile ${r.profileId.slice(0, 8)}… opened /account signed in as ${name} without signing in again`;
});
