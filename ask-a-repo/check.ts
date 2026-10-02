import { check, expect, result, site, size } from "../runner/check-lib.js";

check(() => {
  const r = result();
  expect(Array.isArray(r.answers) && r.answers.length === r.questions.length, `${r.questions.length} answers expected, got ${r.answers?.length}`);
  for (const a of r.answers) expect(a.answer.length > 10 && a.files.length > 0, `"${a.question}" has no real answer or names no file`);
  expect(r.missingFiles.length === 0, `answers name files that are not in the repository: ${r.missingFiles.join(", ")}`);
  expect(r.toolSteps.some((s: any) => s.name === "bash"), "the agent never used the shell to read the code");
  expect(r.agentRuns?.[0]?.id, "the agent run id is missing");
  expect(size("answers.md") > 100, "answers.md is missing");
  if (!site()) return `${r.answers.length} answers about ${r.repoUrl}, every named file exists; ${r.toolSteps.length} tool steps`;
  // The stand-in repository: its test runner, the pages its tests check, and the variable they need.
  const [runner, pages, variable] = r.answers.map((a: any) => a.answer);
  expect(/node:test|node --test/i.test(runner), `the tests use node:test (node --test): "${runner}"`);
  expect(/pricing/i.test(pages) && /about/i.test(pages) && /Example Widgets/.test(pages), `the tests check the home page ("Example Widgets"), /pricing and /about: "${pages}"`);
  expect(/STAGING_URL/.test(variable), `STAGING_URL must be set: "${variable}"`);
  expect(r.answers.some((a: any) => a.files.includes("test/pages.test.mjs")), "no answer cites test/pages.test.mjs");
  return `node:test, the 3 pages with their titles, STAGING_URL; cites test/pages.test.mjs; ${r.toolSteps.length} shell steps, no browser`;
});
