import { check, expect, result } from "../../runner/check-lib.js";

check(async () => {
  const r = result();
  const boxline = r.calls.filter((c: any) => c.tool === "boxline_fetch" || c.tool === "boxline_browser_agent");
  expect(boxline.length >= 1, `the LangChain agent never called a Boxline tool: ${JSON.stringify(r.calls)}`);
  if (!process.env.QUESTION) {
    // The book's price and stock, read from the demo shop itself.
    const html = await fetch("https://books.toscrape.com/catalogue/sapiens-a-brief-history-of-humankind_996/index.html").then((x) => x.text());
    const price = /price_color">£([\d.]+)</.exec(html)?.[1]!;
    const stock = /In stock \((\d+) available\)/.exec(html)?.[1]!;
    expect(r.answer.includes(price) && r.answer.includes(stock), `the answer does not give £${price} and ${stock} in stock: ${r.answer.slice(0, 200)}`);
    return `the LangChain agent called ${boxline.map((c: any) => c.tool).join(", ")} and answered £${price}, ${stock} in stock`;
  }
  return `the LangChain agent called ${boxline.map((c: any) => c.tool).join(", ")}: ${r.answer.slice(0, 100)}`;
});
