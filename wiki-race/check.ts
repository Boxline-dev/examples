import { check, expect, result } from "../runner/check-lib.js";

check(() => {
  const r = result();
  const v = r.verified;
  // Judged on what the browser visited, not on what the agent says.
  expect(v.reached, `the browser never got to "${v.target}" (last article: ${v.route.at(-1)})`);
  expect(v.allLinked, `a hop is not a link on its page: ${v.hops.filter((h: any) => !h.linked).map((h: any) => `${h.from} → ${h.to}`).join(", ")}`);
  expect(!r.toolSteps.includes("browser_navigate"), "the agent typed an address (browser_navigate)");
  expect(v.hops.length >= v.shortest.hops, `${v.hops.length} hops is fewer than the shortest possible ${v.shortest.hops}`);
  expect(r.toolSteps.includes("browser_click"), "no clicks");
  const extra = v.hops.length - v.shortest.hops;
  return `${v.route.join(" → ")}: ${v.hops.length} hops, each a link on its page (checked with Wikipedia's API from the visited pages); shortest possible ${v.shortest.hops === 3 ? "3+" : v.shortest.hops}${extra > 0 ? ` (${extra} more)` : " (as short as it gets)"}`;
});
