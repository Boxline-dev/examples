import { existsSync } from "node:fs";
import { check, expect, file, result } from "../runner/check-lib.js";

check(() => {
  const r = result();
  // The example's own test run, from a fresh download of the cases: every one passes.
  expect(r.tests.total > 0, "no test cases ran");
  expect(r.tests.passed === r.tests.total, `${r.tests.passed}/${r.tests.total} pass: ${JSON.stringify(r.tests.failed?.[0] ?? r.tests.error)}`);
  expect(!r.testsChanged, "the agent changed run_tests.py or canonical-data.json");
  // The agent worked in the shell and ran the tests itself; what it reported matches.
  expect(r.toolSteps.some((s: any) => s.name === "bash"), "the agent never used the shell");
  expect(r.toolSteps.some((s: any) => /run_tests\.py/.test(JSON.stringify(s.input))), "the agent never ran the tests");
  expect(r.agent.passed === r.tests.passed && r.agent.total === r.tests.total, `the agent reported ${r.agent.passed}/${r.agent.total}, the tests say ${r.tests.passed}/${r.tests.total}`);
  expect(existsSync(file("solution.py")) && r.solutionLines > 0, "no solution.py");
  return `${r.exercise}: ${r.tests.passed}/${r.tests.total} canonical cases pass when run again from a fresh copy; ${r.solutionLines}-line solution.py; the agent ran the tests itself (${r.toolSteps.length} tool steps) and left them unchanged`;
});
