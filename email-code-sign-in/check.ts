import { check, expect, result, site } from "../runner/check-lib.js";

check(async () => {
  const r = result();
  expect(r.status === "completed", `the run ended ${r.status}: ${r.answer}`);
  // The run waited for the code (a code step: waiting), then got it (received): the platform held the typing back.
  expect(JSON.stringify(r.codeSteps) === JSON.stringify(["waiting", "received"]), `the run's code steps were ${JSON.stringify(r.codeSteps)}, not waiting then received`);
  expect(Number.isFinite(r.pushedAt), "the example never sent a code");
  expect(r.audit?.some((a: any) => a.action === "code" && a.kind === "code"), `the audit has no pushed code: ${JSON.stringify(r.audit)}`);
  const standIn = site();
  if (!standIn) return `signed in: the run waited for the emailed code, got the one the example pushed, and finished: ${String(r.answer).slice(0, 100)}`;

  const want = standIn.expected.emailedCode;
  const steps: { step: string; code?: string; at: number }[] = standIn.records.emailedCode;
  const names = steps.map((s) => s.step);
  const passwordOk = steps.find((s) => s.step === "password ok");
  const sent = steps.find((s) => s.step === "code sent");
  const codeOk = steps.find((s) => s.step === "code ok");
  expect(passwordOk && sent && codeOk, `the site saw: ${names.join(", ") || "nothing"}`);
  expect(!names.includes("code wrong"), `the site saw a wrong code: ${names.join(", ")}`);
  expect(passwordOk.at <= sent.at && sent.at <= codeOk.at, `the steps came in a wrong order: ${names.join(", ")}`);
  // The right code: the one the site emailed, typed after the example pushed it (so it could not have been typed before it was sent).
  expect(codeOk.code === sent.code && /^\d{6}$/.test(String(codeOk.code)), `the code typed was ${codeOk.code}, the site sent ${sent.code}`);
  expect(codeOk.at >= r.pushedAt, `the site took the code at ${codeOk.at}, before it was pushed at ${r.pushedAt}`);
  expect(String(r.answer).includes(want.name), `the answer does not name ${want.name}: ${r.answer}`);

  // Nothing the platform keeps or returns for the run, the credential's audit or the example's own result may hold the code or the password.
  const api = process.env.BOXLINE_API_URL ?? "https://api.boxline.dev";
  const get = (path: string) => fetch(api + path, { headers: { "x-api-key": process.env.BOXLINE_API_KEY ?? "" } }).then((x) => x.text());
  const runText = await get(`/v1/agent/runs/${r.agentRuns[0].id}`);
  const auditText = await get(`/v1/credentials/audit?name=${r.credential}`);
  expect(runText.includes('"steps"') && auditText.includes('"data"'), "could not read the run or the audit back");
  for (const [what, v] of [["code", sent.code!], ["password", want.password]] as const) {
    expect(!runText.includes(v), `the stored run contains the ${what}`);
    expect(!auditText.includes(v), `the credential's audit contains the ${what}`);
    expect(!JSON.stringify(r).includes(v), `the example's result contains the ${what}`);
  }
  expect(auditText.includes('"code"'), "the credential's audit has no entry for the pushed code");
  return `the site saw ${names.join(" → ")}; the right code was typed after it was pushed (${r.codeSteps.join(" → ")}), signed in as ${want.name}; the run, the audit and the result hold neither the code nor the password`;
});
