/**
 * Public registry lookup: an agent finds a company in the UK's public company register (Companies House), then
 * extract reads its record into JSON with a schema.
 *
 *   npx tsx node/index.ts            (BOXLINE_API_KEY; COMPANY for another company)
 *
 * Writes output/record.json.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Boxline } from "@boxline/sdk";

const out = process.env.OUTPUT_DIR ?? "output";
const company = process.env.COMPANY ?? "ARM LIMITED";
const REGISTER = "https://find-and-update.company-information.service.gov.uk";
const bx = new Boxline();

interface CompanyRecord {
  companyNumber: string;
  name: string;
  status: string;
  type: string;
  incorporated: string;
  registeredOffice: string;
}

// 1. The agent searches the register and opens the company's overview page (it chooses among similar names).
const run = await bx.agent.run({
  task: `Find the company "${company}" on the UK Companies House register (${REGISTER}): search for it and open its overview page. Reply with the address of that overview page only.`,
  maxSteps: 15,
});
console.log(`Agent run ${run.id} (${run.provider}/${run.model}) · Session: ${run.sessionId}`);
for await (const e of bx.agent.stream(run.id)) {
  if (e.type === "tool") console.log(`→ ${e.name} ${JSON.stringify(e.input ?? {}).slice(0, 100)}`);
  else if (e.type === "done") console.log(`${e.status}: ${e.result ?? e.error}`);
}
const done = await bx.agent.get(run.id);
const page = /https:\/\/find-and-update\.company-information\.service\.gov\.uk\/company\/[A-Z0-9]+/i.exec(done.result ?? "")?.[0];
if (!page) throw new Error(`the agent did not find the company's page: ${done.result ?? done.error}`);

// 2. extract reads the record on that page into a fixed shape.
const { data, usage } = await bx.extract<CompanyRecord>({
  url: page,
  prompt: "The company record on this page.",
  schema: {
    type: "object",
    properties: {
      companyNumber: { type: "string" },
      name: { type: "string" },
      status: { type: "string" },
      type: { type: "string", description: "the company type, e.g. Private limited company" },
      incorporated: { type: "string", description: "the incorporation date as YYYY-MM-DD" },
      registeredOffice: { type: "string", description: "the registered office address on one line" },
    },
    required: ["companyNumber", "name", "status", "type", "incorporated", "registeredOffice"],
  },
});
console.log(JSON.stringify(data, null, 2));

mkdirSync(out, { recursive: true });
writeFileSync(join(out, "record.json"), JSON.stringify(data, null, 2));
writeFileSync(join(out, "result.json"), JSON.stringify({ company, page, record: data, agentRuns: [{ id: run.id }], usage: { modelUsd: usage.costUsd } }, null, 2));
