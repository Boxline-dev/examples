import { check, expect, result } from "../runner/check-lib.js";

check(async () => {
  const r = result();
  expect(r.status === "completed", `the run ended ${r.status}: ${r.answer}`);
  expect(r.questions.length >= 1, "the agent never asked, though several books fit");
  const answer = String(r.answer);
  if (!process.env.TASK) {
    // Which Travel books cost under £30, and the cheapest of them: read from the demo shop itself.
    const html = await fetch("https://books.toscrape.com/catalogue/category/books/travel_2/index.html").then((x) => x.text());
    const books = [...html.matchAll(/title="([^"]+)">[\s\S]*?price_color">£([\d.]+)</g)].map((m) => ({ title: m[1]!.replace(/&#39;/g, "'"), price: Number(m[2]) }));
    const under = books.filter((b) => b.price < 30).sort((a, b) => a.price - b.price);
    expect(under.length >= 2, `only ${under.length} Travel books under £30 on the site now`);
    const cheapest = under[0]!;
    expect(answer.includes(cheapest.price.toFixed(2)) && answer.toLowerCase().includes(cheapest.title.split(":")[0]!.toLowerCase().slice(0, 20)), `the answer is not the cheaper book (${cheapest.title}, £${cheapest.price}): ${answer.slice(0, 200)}`);
    return `asked ${r.questions.length}× ("${r.questions[0].slice(0, 70)}"), then chose the cheaper of ${under.length}: ${cheapest.title} £${cheapest.price.toFixed(2)}`;
  }
  return `asked ${r.questions.length}×, then answered: ${answer.slice(0, 120)}`;
});
