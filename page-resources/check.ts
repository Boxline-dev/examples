import { bytes, check, expect, isPng, result, site, size } from "../runner/check-lib.js";

check(() => {
  const r = result();
  expect(r.status && r.status < 400 && r.requests > 1, `the page did not load with its requests: ${r.status}, ${r.requests}`);
  expect(r.byType.some((t: any) => t.name === "Document"), `no document request: ${r.byType.map((t: any) => t.name).join(", ")}`);
  expect(r.totalKb > 0, "no bytes were counted (network events without data.bytes?)");
  expect(isPng(bytes("page.png")) && size("report.md") > 200, "page.png or report.md is missing");
  const st = site();
  if (!st) return `${r.requests} requests, ${r.totalKb} KB, ${r.thirdParties.length} third-party hosts, ${r.failed.length} failed`;
  // The stand-in: a stylesheet, a slow script, a 320 KB hero image, a missing image and a third-party image.
  const types = new Set(r.byType.map((t: any) => t.name));
  for (const t of ["Document", "Stylesheet", "Script", "Image"]) expect(types.has(t), `no ${t} request: ${[...types].join(", ")}`);
  expect(r.failed.some((f: any) => f.url.endsWith("/resources/missing.png") && f.status === 404), `the missing image (404) is not among the failures: ${JSON.stringify(r.failed)}`);
  expect(r.thirdParties.includes("example.com"), `example.com is the third party: ${r.thirdParties.join(", ")}`);
  expect(r.heaviest[0].url.endsWith("/resources/hero.png") && r.heaviest[0].kb >= 300, `the hero image (320 KB) is the heaviest: ${JSON.stringify(r.heaviest[0])}`);
  const slow = r.slowest.find((s: any) => s.url.endsWith("/resources/slow.js"));
  expect(slow && slow.ms >= 1400, `slow.js (1.5 s) is among the slowest: ${JSON.stringify(r.slowest)}`);
  return `${r.requests} requests, ${r.totalKb} KB; heaviest: hero.png ${r.heaviest[0].kb} KB; slowest: slow.js ${slow.ms} ms; failed: missing.png 404; third party: example.com`;
});
