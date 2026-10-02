import { bytes, check, expect, isPng, result, site } from "../runner/check-lib.js";

check(() => {
  const r = result();
  expect(r.desktop?.viewport > 1000 && r.phone?.viewport <= 400, `the two widths were not measured: ${r.desktop?.viewport}, ${r.phone?.viewport}`);
  expect(r.desktop.palette.length > 0 && r.desktop.fonts.length > 0, "no palette or fonts measured");
  expect(isPng(bytes("desktop.png")) && isPng(bytes("phone.png")), "a screenshot is missing");
  expect(r.fixes.length >= 1 && r.summary.length > 20, "no summary or fixes");
  if (!site()) return `palette ${r.desktop.palette.length} colours; ${r.desktop.contrastFailures.length} contrast failures; phone ${r.phone.horizontalOverflow ? "scrolls sideways" : "fits"}; ${r.fixes.length} fixes`;
  // The stand-in: grey text on white, an image without alt, h1 → h3, a 900 px banner and a 20 × 18 px button.
  const grey = r.desktop.contrastFailures.find((c: any) => c.text.startsWith("Free returns"));
  expect(grey && grey.ratio < 2 && grey.color === "#bbbbbb", `the grey "Free returns" line (1.9:1) is not a contrast failure: ${JSON.stringify(r.desktop.contrastFailures)}`);
  expect(r.desktop.imagesWithoutAlt.some((s: string) => s.endsWith("/img/red.png")), "the image without alt is not found");
  expect(r.desktop.headingSkips.includes("h1 → h3"), `the h1 → h3 skip is not found: ${r.desktop.headingSkips}`);
  expect(r.phone.horizontalOverflow && r.phone.overflowing.includes("div#promo"), `the 900 px banner should make the phone scroll sideways: ${JSON.stringify(r.phone.overflowing)}`);
  expect(r.phone.smallTargets.some((t: any) => t.target === "×" && t.width === 20 && t.height === 18), `the 20 × 18 px button is not a small target: ${JSON.stringify(r.phone.smallTargets)}`);
  expect(r.fixes.some((f: any) => /contrast|grey|gray|#bbb/i.test(f.fix)), "no fix addresses the contrast");
  return `contrast 1.9:1 on "Free returns", image without alt, h1 → h3, #promo too wide for a phone, 20×18 button; ${r.fixes.length} fixes (contrast among them)`;
});
