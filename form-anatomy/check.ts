import { bytes, check, expect, isPng, result, site } from "../runner/check-lib.js";

check(() => {
  const r = result();
  expect(r.action && r.method && r.fields?.length > 0, `no form read: ${JSON.stringify(r).slice(0, 160)}`);
  for (const f of r.fields.filter((x: any) => x.required)) expect(f.emptyMessage, `the required field ${f.name} has no browser message when empty`);
  expect(isPng(bytes("form.png")), "the screenshot is missing");
  const st = site();
  if (!st) return `${r.method.toUpperCase()} ${r.action}: ${r.fields.length} fields (${r.fields.filter((f: any) => f.required).length} required), ${r.hidden.length} hidden, ${r.warnings.length} warnings`;
  // The stand-in sign-up form: its rules, the browser's messages, its token, and no submission.
  const by = (n: string) => r.fields.find((f: any) => f.name === n);
  expect(r.method === "post" && r.action.endsWith("/forms/signup/submit") && r.csrfToken, `post to /forms/signup/submit with a CSRF token expected: ${r.method} ${r.action}, token ${r.csrfToken}`);
  const required = r.fields.filter((f: any) => f.required).map((f: any) => f.name).sort().join(",");
  expect(required === "email,full_name,password", `the required fields are full_name, email and password: ${required}`);
  expect(by("email").invalidMessage && by("age").min === "18" && by("age").invalidExample === "17" && by("age").invalidMessage, `email and age should be refused for a wrong value: ${JSON.stringify([by("email"), by("age")])}`);
  expect(by("postcode").pattern && by("postcode").invalidMessage && by("password").minlength === "12", "the postcode pattern or the password length is missing");
  expect(!st.records.person.formSubmitted, "the form was submitted; it must only be inspected");
  return `POST with a CSRF token; required: full name, email, password; the browser refuses "not-an-email", age 17 and a bad postcode; password ≥ 12; never submitted`;
});
