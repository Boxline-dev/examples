import { check, expect, result } from "../../runner/check-lib.js";

check(async () => {
  const r = result();
  const fetched = r.calls.filter((c: any) => c.tool === "boxline_fetch");
  expect(fetched.length >= 1, `the model never read a page with the boxline_fetch tool: ${JSON.stringify(r.calls)}`);
  if (!process.env.QUESTION) {
    // The book's price and stock, read from the demo shop itself.
    const html = await fetch("https://books.toscrape.com/catalogue/sapiens-a-brief-history-of-humankind_996/index.html").then((x) => x.text());
    const price = /price_color">£([\d.]+)</.exec(html)?.[1]!;
    const stock = /In stock \((\d+) available\)/.exec(html)?.[1]!;
    expect(r.answer.includes(price) && r.answer.includes(stock), `the answer does not give £${price} and ${stock} in stock: ${r.answer.slice(0, 200)}`);
    expect(fetched.some((c: any) => /sapiens/i.test(c.input.url)), "the model answered without opening the book's page");
    return `${r.calls.length} tool calls (${fetched.map((c: any) => new URL(c.input.url).pathname).join(", ")}); answered £${price}, ${stock} in stock; ${r.usage.ownModelTokens} tokens on your key`;
  }
  return `${r.calls.length} tool calls; answered: ${r.answer.slice(0, 100)}`;
});
