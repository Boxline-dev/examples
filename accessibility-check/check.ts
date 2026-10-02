import { check, expect, readJson, site } from "../runner/check-lib.js";

const ORDER = ["critical", "serious", "moderate", "minor"];

check(() => {
  const issues = readJson<{ id: string; impact: string; count: number }[]>("issues.json");
  expect(Array.isArray(issues), "issues.json is not a list");
  const ranks = issues.map((i) => ORDER.indexOf(i.impact));
  expect(ranks.every((r, i) => r >= 0 && (i === 0 || r >= ranks[i - 1]!)), `the issues are not sorted worst first: ${issues.map((i) => i.impact).join(", ")}`);
  if (!site()) return `${issues.length} kinds of issue, worst first (${issues.slice(0, 3).map((i) => i.id).join(", ")})`;
  const want = ["image-alt", "label", "button-name"];
  const ids = issues.map((i) => i.id);
  expect(want.every((id) => ids.includes(id)), `axe reported ${ids.join(", ")}, not all of ${want.join(", ")}`);
  expect(issues[0]!.impact === "critical", `the list starts with a ${issues[0]!.impact} issue`);
  return `axe found ${want.join(", ")} (critical, listed first) among ${issues.length} kinds of issue on the stand-in /a11y page`;
});
