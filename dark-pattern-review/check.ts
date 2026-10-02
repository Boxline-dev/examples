import { check, expect, result, site } from "../runner/check-lib.js";

// Each known pattern on the stand-in: words its quote must share, the categories that fit it.
const KNOWN: Record<string, { words: RegExp; fits: string[] }> = {
  urgency: { words: /sale ends|countdown|09:5\d/i, fits: ["urgency", "scarcity"] },
  scarcity: { words: /2 left/i, fits: ["scarcity", "urgency"] },
  sneaking: { words: /protection plan|7\.40/i, fits: ["sneaking", "hidden_costs", "misdirection"] },
  confirmshaming: { words: /full price/i, fits: ["confirmshaming", "misdirection"] },
  hidden_costs: { words: /6\.83/, fits: ["hidden_costs", "sneaking"] },
  forced_continuity: { words: /19\.90|renews/i, fits: ["forced_continuity", "hidden_costs", "sneaking", "obstruction", "misdirection"] },
};

check(() => {
  const r = result();
  expect(r.status === "completed", `the run ended ${r.status}`);
  const review = String(r.review ?? "");
  expect(review.length > 300, `the review is too short: ${review.slice(0, 120)}`);
  if (!process.env.TASK) {
    const pages = r.pages.join(" ");
    expect(/checkout-step-two/.test(pages), "the agent never reached the last checkout step (checkout-step-two)");
    expect(!/checkout-complete/.test(pages), "the agent placed the order (it reached checkout-complete)");
    expect(/tax|total|cost|price/i.test(review), "the review says nothing about costs");
  }
  expect(r.scans.length >= 1, "no page was scanned");
  for (const s of r.scans) for (const p of s.patterns) expect(p.quote && p.why && p.category, `an incomplete pattern on ${s.url}: ${JSON.stringify(p)}`);
  const walk = `reached the last checkout step and stopped; review of ${review.length} chars, ${r.steps} steps`;
  const standIn = site();
  if (!standIn) return `${walk}; scanned ${r.scans.length} pages, ${r.scans.reduce((a: number, s: any) => a + s.patterns.length, 0)} patterns quoted from them`;

  // The measurements, taken in the browser.
  const deals = r.scans.find((s: any) => /\/deals\/$/.test(s.url));
  const checkout = r.scans.find((s: any) => /\/deals\/checkout/.test(s.url));
  expect(deals && checkout, `both stand-in pages must be scanned: ${r.scans.map((s: any) => s.url).join(", ")}`);
  expect(deals.measured.preChecked.some((c: any) => /protection plan/i.test(c.label)), `the ticked protection plan was not measured: ${JSON.stringify(deals.measured.preChecked)}`);
  expect(deals.measured.timers.some((t: any) => t.restartsOnReload === true), `the countdown that restarts on reload was not caught: ${JSON.stringify(deals.measured.timers)}`);
  expect(deals.measured.dialogs.some((d: any) => d.choices.some((c: string) => /full price/i.test(c))), "the pop-up's choices were not measured");
  expect((checkout.measured.lateCharges ?? []).some((c: string) => /6\.83/.test(c)), `the service fee first shown at checkout was not measured as late: ${JSON.stringify(checkout.measured.lateCharges)}`);
  expect(checkout.measured.smallPrint.some((x: any) => /19\.90/.test(x.text) && x.fontSize < 11), `the 9 px renewal terms were not measured: ${JSON.stringify(checkout.measured.smallPrint)}`);

  // The model's patterns: each known one found, quoted from the page, in a category that fits.
  const found = r.scans.flatMap((s: any) => s.patterns);
  const missing = Object.entries(KNOWN).filter(([, k]) => !found.some((p: any) => k.words.test(`${p.quote} ${p.name}`) && k.fits.includes(p.category)));
  expect(missing.length <= 1, `missed: ${missing.map(([n]) => n).join(", ")}; found ${JSON.stringify(found.map((p: any) => [p.category, p.quote]))}`);
  const aside = r.scans.reduce((a: number, s: any) => a + s.unverified.length, 0);
  return `${walk}; stand-in scan: ${6 - missing.length} of 6 known patterns, each quoted from the page${missing.length ? ` (missed ${missing[0]![0]})` : ""}; measured: ticked plan, countdown restarts on reload, late $6.83 fee, 9 px renewal terms, pop-up wording; ${aside} quotes set aside`;
});
