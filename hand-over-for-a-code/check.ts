import { check, expect, result, site } from "../runner/check-lib.js";

check(async () => {
  const r = result();
  expect(r.status === "completed", `the run ended ${r.status}`);
  expect(r.handovers >= 1, "the AI never asked for the code");
  const standIn = site();
  if (!standIn) return `the AI asked ${r.handovers}× and answered: ${String(r.answer).slice(0, 100)}`;
  const { name, password } = standIn.expected.login;
  expect(String(r.answer).includes(name), `the answer does not name ${name}: ${r.answer}`);
  const steps = standIn.records.logins.map((l: any) => l.step);
  expect(steps.includes("password ok") && steps.includes("code ok") && steps.indexOf("password ok") < steps.lastIndexOf("code ok"), `the site saw: ${steps.join(", ")}`);
  // The password was typed, but the run the API keeps must not hold it anywhere (steps, inputs, answer).
  const api = process.env.BOXLINE_API_URL ?? "https://api.boxline.dev";
  const raw = await fetch(`${api}/v1/agent/runs/${r.agentRuns[0].id}`, { headers: { "x-api-key": process.env.BOXLINE_API_KEY ?? "" } }).then((x) => x.text());
  expect(raw.includes("%password%") || raw.includes('"steps"'), "could not read the run back from the API");
  expect(!raw.includes(password), "the stored run contains the password");
  // The password came from the credential: the run used it (audited once), and the API never shows the value.
  const headers = { "x-api-key": process.env.BOXLINE_API_KEY ?? "" };
  const secret = await fetch(`${api}/v1/credentials/${r.secret}`, { headers }).then((x) => x.text());
  expect(secret.includes(`"name":"${r.secret}"`) && !secret.includes(password), `the credential ${r.secret} is missing or shows its value`);
  const audit = await fetch(`${api}/v1/credentials/audit?name=${r.secret}&limit=20`, { headers }).then((x) => x.json());
  expect(audit.data.some((e: any) => e.action === "use" && e.usedBy?.id === r.agentRuns[0].id), `no audited use of ${r.secret} by run ${r.agentRuns[0].id}`);
  return `the site saw the password (from the credential ${r.secret}), then the code (${steps.join(" → ")}); the AI asked ${r.handovers}× and answered "${String(r.answer).slice(0, 50)}"; the run never holds the password; the credential's use is audited`;
});
