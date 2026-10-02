import { check, expect, result, site } from "../runner/check-lib.js";

check(async () => {
  const r = result();
  expect(r.status === "completed", `the run ended ${r.status}: ${r.answer}`);
  expect(r.login?.hasPassword && r.login?.hasTotp, `the saved login has no password or 2FA key: ${JSON.stringify(r.login)}`);
  const standIn = site();
  if (!standIn) return `signed in with the saved login's details (2FA on): ${String(r.answer).slice(0, 100)}`;
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
  const ctxText = await get(`/v1/contexts/${r.contextId}`);
  expect(runText.includes('"steps"') && ctxText.includes('"login"'), "could not read the run or the saved login back");
  for (const [what, v] of [["password", want.password], ["user name", want.username], ["code", codeOk.code]] as const) {
    expect(!runText.includes(v), `the stored run contains the ${what}`);
  }
  expect(!ctxText.includes(want.password) && !/totp[^"]*"\s*:\s*"[A-Z2-7]{16,}/i.test(ctxText), "the saved login shows its password or 2FA key");
  return `the site saw the password, then a valid 2FA code (${steps.map((s: any) => s.step).join(" → ")}); signed in as ${want.name}; the run holds none of the user name, password or code, and the saved login shows only ${JSON.stringify({ hasPassword: r.login.hasPassword, hasTotp: r.login.hasTotp })}`;
});
