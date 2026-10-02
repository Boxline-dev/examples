import { check, expect, result, size } from "../runner/check-lib.js";

check(() => {
  const r = result();
  expect(r.listed > 0 && Array.isArray(r.repos) && r.repos.length > 0, `no repositories: ${JSON.stringify(r).slice(0, 200)}`);
  for (const x of r.repos) {
    expect(!x.fork && x.url.toLowerCase().includes(`/${r.user.toLowerCase()}/`), `${x.url} is not one of ${r.user}'s own repositories`);
    expect(x.measured, `${x.name} was not measured`);
  }
  const cloned = r.repos.filter((x: any) => !x.measured.error);
  expect(cloned.length >= 1, `no repository could be cloned: ${r.repos.map((x: any) => x.measured.error).join("; ")}`);
  expect(r.languages.length > 0 && r.languages.every((l: any) => l.lines > 0), `no lines of code were counted: ${JSON.stringify(r.languages)}`);
  const share = r.languages.reduce((a: number, l: any) => a + l.share, 0);
  expect(Math.abs(share - 100) < 1, `language shares add up to ${share}%`);
  expect(size("summary.md") > 200, "summary.md is missing");
  if (r.user === "octocat") expect(r.languages.some((l: any) => ["HTML", "CSS"].includes(l.language)), `octocat's top repositories are HTML and CSS pages: ${r.languages.map((l: any) => l.language).join(", ")}`);
  return `${r.user}: ${cloned.length} of ${r.repos.length} top repositories cloned and measured; ${r.languages.map((l: any) => `${l.language} ${l.share}%`).join(", ")}; frameworks: ${r.frameworks.join(", ") || "none"}`;
});
