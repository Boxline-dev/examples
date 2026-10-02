import { check, expect, result } from "../../runner/check-lib.js";

check(async () => {
  const r = result();
  const fetched = r.calls.filter((c: any) => c.tool === "boxline_fetch");
  expect(fetched.length >= 1, "the crew never used the Boxline tool");
  if (!process.env.QUESTION) {
    // The book's price and stock, read from the demo shop itself.
    const html = await fetch("https://books.toscrape.com/catalogue/sapiens-a-brief-history-of-humankind_996/index.html").then((x) => x.text());
    const price = /price_color">£([\d.]+)</.exec(html)?.[1]!;
    const stock = /In stock \((\d+) available\)/.exec(html)?.[1]!;
    expect(r.answer.includes(price) && r.answer.includes(stock), `the answer does not give £${price} and ${stock} in stock: ${r.answer.slice(0, 200)}`);
    return `the crew's agent read ${fetched.length} page${fetched.length === 1 ? "" : "s"} through boxline_fetch and answered £${price}, ${stock} in stock; ${r.usage.ownModelTokens} tokens on your key`;
  }
  return `the crew read ${fetched.length} page(s): ${r.answer.slice(0, 100)}`;
});
