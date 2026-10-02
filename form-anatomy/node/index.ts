/**
 * Form anatomy: take a web form apart without submitting it. Every field with its label, type and rules (required,
 * length, range, pattern, autocomplete), the messages the browser itself shows for an empty and for a wrong value,
 * the hidden fields (and whether one is a CSRF token), where and how it posts, and warnings (passwords without HTTPS,
 * posting to another site, fields without labels). For testing and documenting your own forms.
 *
 *   npx tsx node/index.ts            (BOXLINE_API_KEY; FORM_URL, FORM_SELECTOR)
 *
 * anatomy.js runs in the page; no model is used and nothing is submitted. Writes output/result.json and output/form.md.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Boxline } from "@boxline/sdk";

const here = dirname(fileURLToPath(import.meta.url));
const out = process.env.OUTPUT_DIR ?? "output";
const url = process.env.FORM_URL ?? "https://httpbin.org/forms/post";
const selector = process.env.FORM_SELECTOR ?? "";
const anatomy = readFileSync(join(here, "../anatomy.js"), "utf8").replace(/^\s*\/\/.*$/gm, "").trim();
const bx = new Boxline();

type Field = { name: string; label: string; type: string; required: boolean; minlength: string | null; maxlength: string | null; min: string | null; max: string | null; pattern: string | null; title: string | null; autocomplete: string | null; emptyMessage: string | null; invalidExample: string | null; invalidMessage: string | null };
type Anatomy = { page: string; action: string; method: string; enctype: string; target: string | null; novalidate: boolean; scriptedSubmit: boolean; fields: Field[]; hidden: { name: string; looksLikeToken: boolean }[]; csrfToken: boolean; warnings: string[] };

const session = await bx.sessions.create({ timeout: 180, userMetadata: { example: "form-anatomy" } });
console.log(`Session: ${session.id}`);
let form: Anatomy | null;
try {
  await session.goto(url, { waitUntil: "load" });
  form = await session.evaluate<Anatomy | null>(`(${anatomy})(${JSON.stringify(selector)})`);
  const shot = await session.screenshot({ fullPage: true });
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "form.png"), Buffer.from(shot.data, "base64"));
} finally {
  await session.release();
}
if (!form) throw new Error(`no form${selector ? ` matches ${selector}` : ""} on ${url}`);

const rules = (f: Field) =>
  [f.required && "required", f.minlength && `at least ${f.minlength} characters`, f.maxlength && `at most ${f.maxlength}`, f.min && `≥ ${f.min}`, f.max && `≤ ${f.max}`, f.pattern && `pattern ${f.pattern}`, f.autocomplete && `autocomplete=${f.autocomplete}`]
    .filter(Boolean)
    .join(", ");
console.log(`${form.method.toUpperCase()} ${form.action} (${form.enctype})${form.scriptedSubmit ? ", submitted by a script" : ""}${form.novalidate ? ", browser checks off" : ""}`);
for (const f of form.fields) console.log(`  ${f.label || f.name} [${f.type}] ${rules(f)}${f.emptyMessage ? `\n      empty: "${f.emptyMessage}"` : ""}${f.invalidMessage ? `\n      "${f.invalidExample}": "${f.invalidMessage}"` : ""}`);
console.log(`Hidden: ${form.hidden.map((h) => `${h.name}${h.looksLikeToken ? " (token)" : ""}`).join(", ") || "none"}`);
for (const w of form.warnings) console.log(`  ! ${w}`);

const md = [
  `# Form at ${form.page}`,
  "",
  `\`${form.method.toUpperCase()} ${form.action}\` (${form.enctype})${form.scriptedSubmit ? ", submitted by a script" : ""}${form.novalidate ? ", browser checks switched off" : ""}.`,
  "",
  "| Field | Type | Rules | Empty | A wrong value |",
  "|---|---|---|---|---|",
  ...form.fields.map((f) => `| ${f.label || f.name} (\`${f.name}\`) | ${f.type} | ${rules(f) || "none"} | ${f.emptyMessage ?? "accepted"} | ${f.invalidExample ? `\`${f.invalidExample}\`: ${f.invalidMessage ?? "accepted"}` : ""} |`),
  "",
  `Hidden fields: ${form.hidden.map((h) => `\`${h.name}\`${h.looksLikeToken ? " (a token)" : ""}`).join(", ") || "none"}.`,
  "",
  ...(form.warnings.length ? ["## Warnings", "", ...form.warnings.map((w) => `- ${w}`), ""] : []),
  "![The form](form.png)",
  "",
].join("\n");
writeFileSync(join(out, "form.md"), md);
writeFileSync(join(out, "result.json"), JSON.stringify({ url, selector: selector || null, ...form }, null, 2));
