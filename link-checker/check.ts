import { check, expect, result, site } from "../runner/check-lib.js";

check(() => {
  const r = result();
  const standIn = site();
  expect(Array.isArray(r.broken) && Array.isArray(r.slow) && r.checked >= 1, `result.json is incomplete: ${JSON.stringify(r).slice(0, 200)}`);
  if (!standIn) {
    expect(r.checked >= 5, `only ${r.checked} pages checked`);
    return `${r.checked} pages checked: ${r.broken.length} broken, ${r.slow.length} slow`;
  }
  const path = (u: string) => new URL(u).pathname;
  const missing = r.broken.find((b: any) => path(b.url) === "/links/missing");
  expect(missing?.status === 404, `/links/missing is not reported broken with 404: ${JSON.stringify(r.broken)}`);
  const good = r.broken.filter((b: any) => ["/links/a", "/links/b", "/links/slow"].includes(path(b.url)));
  expect(!good.length, `pages that load are reported broken: ${good.map((b: any) => path(b.url)).join(", ")}`);
  const slow = r.slow.find((s: any) => path(s.url) === "/links/slow");
  expect(slow && slow.ms >= 2500, `/links/slow (2.6 s) is not reported slow: ${JSON.stringify(r.slow)}`);
  expect(r.checked >= 5, `only ${r.checked} pages checked (the start page and its 4 links)`);
  const ext = (h: string) => r.external.find((e: any) => new URL(e.url).hostname === h);
  expect(ext("example.com")?.verdict === "working", `the link to example.com should work: ${JSON.stringify(r.external)}`);
  expect(ext("shop.does-not-exist.invalid")?.verdict === "broken", `the link to a domain that cannot exist should be broken: ${JSON.stringify(r.external)}`);
  return `${r.checked} pages checked; broken: /links/missing (404); slow: /links/slow (${(slow.ms / 1000).toFixed(1)} s); /links/a, /links/b not broken; other sites: example.com working, the .invalid shop broken`;
});
