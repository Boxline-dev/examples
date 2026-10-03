import { check, expect, result, site } from "../runner/check-lib.js";

check(async () => {
  const r = result();
  expect(r.status === "completed", `the run ended ${r.status}: ${r.answer}`);
  expect(r.credential?.username && r.credential?.hasTotp, `the profile's credential has no user name or 2FA key: ${JSON.stringify(r.credential)}`);
  const standIn = site();
  if (!standIn) return `signed in with the profile's details (2FA on): ${String(r.answer).slice(0, 100)}`;
  const want = standIn.expected.twoFactor;
  const steps = standIn.records.twoFactor;
  const codeOk = steps.find((s: any) => s.step === "code ok");
  expect(steps.some((s: any) => s.step === "password ok") && codeOk, `the site saw: ${steps.map((s: any) => s.step).join(", ") || "nothing"}`);
  expect(/^\d{6}$/.test(codeOk.code), `the code typed was ${codeOk.code}`);
  expect(String(r.answer).includes(want.name), `the answer does not name ${want.name}: ${r.answer}`);
  // Nothing the platform keeps or returns may hold the password, the user name, the code or the 2FA key.
  const api = process.env.BOXLINE_API_URL ?? "https://api.boxline.dev";
  const get = (path: string) => fetch(api + path, { headers: { "x-api-key": process.env.BOXLINE_API_KEY ?? "" } }).then((x) => x.text());
  const runText = await get(`/v1/agent/runs/${r.agentRuns[0].id}`);
  const ctxText = await get(`/v1/profiles/${r.profileId}`);
  const credText = await get(`/v1/credentials/${r.credential.name}`);
  expect(runText.includes('"steps"') && ctxText.includes('"credential"') && credText.includes('"hasTotp"'), "could not read the run, the profile or the credential back");
  for (const [what, v] of [["password", want.password], ["user name", want.username], ["code", codeOk.code]] as const) {
    expect(!runText.includes(v), `the stored run contains the ${what}`);
  }
  expect(!ctxText.includes(want.password) && !credText.includes(want.password) && !/totp[^"]*"\s*:\s*"[A-Z2-7]{16,}/i.test(credText), "the profile or the credential shows its password or 2FA key");
  return `the site saw the password, then a valid 2FA code (${steps.map((s: any) => s.step).join(" → ")}); signed in as ${want.name}; the run holds none of the user name, password or code, and the credential shows only ${JSON.stringify({ username: r.credential.username, hasTotp: r.credential.hasTotp })}`;
});
