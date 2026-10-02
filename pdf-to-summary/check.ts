import { readFileSync } from "node:fs";
import { check, expect, file, result } from "../runner/check-lib.js";

check(() => {
  const r = result();
  const text = readFileSync(file("document.txt"), "utf8");
  const summary = readFileSync(file("summary.md"), "utf8");
  expect(text.length > 1000 && text.length === r.textChars, `document.txt holds ${text.length} characters`);
  const bullets = summary.split("\n").filter((l) => l.startsWith("- "));
  expect(bullets.length === 5 && bullets.every((b) => b.length > 12), `summary.md has ${bullets.length} bullet points, not 5`);
  if (/1706\.03762/.test(r.pdfUrl)) {
    expect(r.pdfBytes > 500_000, `the PDF is only ${r.pdfBytes} bytes`);
    expect(/Attention Is All You Need/i.test(text), "pdftotext's text is not the paper");
    expect(/attention/i.test(r.title), `the title is "${r.title}"`);
    expect(/transformer/i.test(summary) && /attention/i.test(summary), "the summary does not mention the Transformer or attention");
  }
  return `${Math.round(r.pdfBytes / 1024)} KB PDF → ${text.length} chars (pdftotext) → 5 bullets under "${r.title}" (${r.model})`;
});
