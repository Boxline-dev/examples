/**
 * PDF to summary: download a PDF in the session's shell, turn it into text with pdftotext, and have a model sum it up
 * in 5 bullet points from the session's browser. The default is "Attention Is All You Need" on arXiv.
 *
 *   npx tsx node/index.ts            (BOXLINE_API_KEY; PDF_URL for another PDF; a plan with shell sessions)
 *
 * Writes output/document.txt and output/summary.md.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Boxline } from "@boxline/sdk";

const out = process.env.OUTPUT_DIR ?? "output";
const pdfUrl = process.env.PDF_URL ?? "https://arxiv.org/pdf/1706.03762";
const bx = new Boxline();

const session = await bx.sessions.create({ shell: true, timeout: 600, userMetadata: { example: "pdf-to-summary" } });
console.log(`Session: ${session.id}`);
try {
  // 1. The shell: download the PDF and turn it into text (poppler's pdftotext is installed).
  const r = await session.exec(
    'mkdir -p downloads output && curl -sSfL --max-time 120 -o downloads/document.pdf "$PDF_URL" && pdftotext -layout downloads/document.pdf output/document.txt && wc -c < downloads/document.pdf',
    { env: { PDF_URL: pdfUrl }, timeoutMs: 300_000 },
  );
  if (r.exitCode !== 0) throw new Error(`the download or pdftotext failed: ${r.stderr.trim()}`);
  const pdfBytes = Number(r.stdout.trim());
  const text = await session.files.readText("output/document.txt");
  console.log(`${Math.round(pdfBytes / 1024)} KB PDF → ${text.length} characters of text`);

  // 2. The browser shows the text (the first 40,000 characters), and a model summarises the page.
  await session.evaluate(
    `document.title = "document.txt"; document.body.innerHTML = "<pre></pre>"; document.querySelector("pre").textContent = ${JSON.stringify(text.slice(0, 40_000))}; true`,
  );
  const { data, model, usage } = await session.extract<{ title: string; bullets: string[] }>("The document's title, and a summary of the document in exactly 5 short bullet points.", {
    schema: { type: "object", properties: { title: { type: "string" }, bullets: { type: "array", items: { type: "string" }, minItems: 5, maxItems: 5 } }, required: ["title", "bullets"] },
  });
  const summary = `# ${data.title}\n\n${data.bullets.map((b) => `- ${b}`).join("\n")}\n`;
  console.log(`\n${summary}`);

  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "document.txt"), text);
  writeFileSync(join(out, "summary.md"), summary);
  writeFileSync(join(out, "result.json"), JSON.stringify({ pdfUrl, pdfBytes, textChars: text.length, title: data.title, bullets: data.bullets, model, usage: { modelUsd: usage.costUsd } }, null, 2));
} finally {
  await session.release();
}
