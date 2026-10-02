import { check, expect, result, site, size } from "../runner/check-lib.js";

check(() => {
  const r = result();
  expect(r.collected > 0 && Array.isArray(r.predictions) && r.predictions.length > 0, `no themes or predictions: ${JSON.stringify(r).slice(0, 200)}`);
  for (const p of r.predictions) {
    expect(p.claim.split(/\s+/).length <= 40 && ["low", "medium", "high"].includes(p.confidence), `"${p.theme}": a bad claim or confidence: ${p.claim} [${p.confidence}]`);
    expect(p.evidence.length >= 2, `"${p.theme}" rests on ${p.evidence.length} facts; 2 or more expected`);
    // Every fact cites one of the theme's own stories.
    const strip = (u: string) => String(u ?? "").replace(/[#?].*$/, "").replace(/\/$/, "");
    const own = new Set([...p.stories.map((s: any) => s.url), ...p.pages.map((x: any) => x.finalUrl)].filter(Boolean).map(strip));
    for (const e of p.evidence) expect(own.has(strip(e.url)), `"${p.theme}" cites a page outside its stories: ${e.url}`);
  }
  expect(size("predictions.md") > 300, "predictions.md is missing");
  const st = site();
  if (!st) return `${r.predictions.length} themes from ${r.collected} stories: ${r.predictions.map((p: any) => p.theme).join("; ")}`;
  // The stand-in: exactly the WebGPU and the Rust-in-the-kernel themes; each prediction's facts come from its pages.
  const all = st.expected.signals as any[];
  const themeOf = (url: string) => all.find((x) => url.endsWith(`/signals/a/${x.slug}`))?.theme;
  expect(r.predictions.length === 2, `2 themes expected (WebGPU, Rust in the kernel), got ${r.predictions.map((p: any) => p.theme).join("; ")}`);
  const [first, second] = r.predictions;
  expect(/webgpu/.test(first.theme) && first.stories.length === 3, `the strongest theme should be WebGPU with 3 stories: "${first.theme}" (${first.stories.length})`);
  expect(/kernel|rust|linux/.test(second.theme) && second.stories.length === 2, `the second should be Rust in the kernel with 2 stories: "${second.theme}" (${second.stories.length})`);
  for (const p of r.predictions) {
    expect(new Set(p.stories.map((s: any) => themeOf(s.url))).size === 1, `"${p.theme}" mixes stories of different themes`);
    const facts = p.evidence.map((e: any) => e.fact).join(" | ").toLowerCase();
    const tokens = p.stories.map((s: any) => all.find((x) => s.url.endsWith(`/signals/a/${x.slug}`)).token);
    expect(tokens.filter((t: string) => facts.includes(t.toLowerCase())).length >= 2, `"${p.theme}": the facts should quote at least 2 of its pages (${tokens.join(", ")}): ${facts}`);
  }
  return `2 themes (${first.theme}: 3 stories; ${second.theme}: 2), sourdough and floppy left alone; every fact cites its own theme's page`;
});
