import { check, expect, result } from "../runner/check-lib.js";

check(() => {
  const r = result<{ title: string; actionsTitle: string; books: { title: string; price: string }[] }>();
  expect(r.books?.length === 5, `expected 5 books, got ${r.books?.length ?? 0}`);
  expect(r.books[0]!.title === "A Light in the Attic" && r.books[0]!.price === "£51.77", `the first book is ${JSON.stringify(r.books[0])}`);
  expect(r.books.every((b) => b.title && /^£\d+\.\d\d$/.test(b.price)), `a book lacks a title or a £ price: ${JSON.stringify(r.books)}`);
  expect(/Books to Scrape/.test(r.title) && r.actionsTitle === r.title, `Playwright saw "${r.title}", the actions API "${r.actionsTitle}"`);
  return `5 books, the first "A Light in the Attic" £51.77; Playwright and the actions API saw the same page ("${r.title}")`;
});
