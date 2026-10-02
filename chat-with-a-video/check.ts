import { check, expect, result, site } from "../runner/check-lib.js";

check(() => {
  const r = result();
  expect(r.captions > 0 && r.answers?.length > 0 && r.agentRuns?.[0]?.id, `no transcript or no answers: ${JSON.stringify(r).slice(0, 200)}`);
  expect(r.unknownMoments.length === 0, `answers cite moments that are no caption's time: ${r.unknownMoments.join(", ")}`);
  for (const a of r.answers) expect(a.answer.length > 3, `"${a.question}" has no answer`);
  const st = site();
  if (!st) return `${r.captions} captions; ${r.answers.length} answers, every moment a caption's time`;
  // The stand-in talk: three facts said at known moments.
  const want: [RegExp, string][] = [[/50[,.]?000/, "00:12"], [/august/i, "00:31"], [/wind ?break/i, "00:20"]];
  r.answers.forEach((a: any, i: number) => {
    const [fact, at] = want[i]!;
    expect(fact.test(a.answer) && a.moments.some((m: string) => m.includes(at)), `answer ${i + 1} should say ${fact} at ${at}: "${a.answer}" at ${a.moments.join(", ")}`);
  });
  return `5 captions; 50,000 bees at 00:12, harvest in August at 00:31, a wind break at 00:20; every moment checked`;
});
