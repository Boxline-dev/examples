import { check, expect, result } from "../runner/check-lib.js";

check(() => {
  const r = result();
  // The session was created for 300 s and updated to 600: it lives 300 s longer (expiresAt counts from its start).
  expect(r.before.timeout === 300 && r.after.timeout === 600, `timeout went from ${r.before.timeout} to ${r.after.timeout}, not 300 to 600`);
  expect(Math.abs(r.addedSeconds - 300) <= 5, `expiresAt moved by ${r.addedSeconds} s, not by 300 s (${r.before.expiresAt} → ${r.after.expiresAt})`);
  expect(Date.parse(r.after.expiresAt) > Date.parse(r.before.expiresAt), "expiresAt did not move later");
  // rotateUrls: new URLs; the old ones stop working, the new ones work.
  expect(r.before.connectWorked, "the connect URL did not work before the update");
  expect(r.urlsChanged.connectUrl && r.urlsChanged.liveUrl, `the URLs after the update: ${JSON.stringify(r.urlsChanged)}`);
  expect(r.oldConnect.refused, `the old connect URL still worked after ${r.oldConnect.tries} tries`);
  expect(r.oldLive.status === 401, `the old live URL answered ${r.oldLive.status}, not 401`);
  expect(r.newLive.status === 200, `the new live URL answered ${r.newLive.status}, not 200`);
  expect(r.newConnect.connected, "the new connect URL did not work");
  return `timeout 300 → 600 moved expiresAt by ${r.addedSeconds} s; after rotateUrls the old connect URL was refused (${r.oldConnect.tries} ${r.oldConnect.tries === 1 ? "try" : "tries"}) and the old live URL answered 401, the new live URL 200 and the new connect URL connected`;
});
