import { bytes, check, expect, isPng, result } from "../../runner/check-lib.js";

check(() => {
  const r = result();
  expect(r.quotes?.length === 3 && r.quotes[0].author === "Albert Einstein", `the first quotes are ${JSON.stringify(r.quotes)}`);
  expect(/\/page\/2\/$/.test(r.page2Url) && r.page2Author === "Marilyn Monroe", `page 2: ${r.page2Url}, first author ${r.page2Author}`);
  const png = bytes("page.png");
  expect(isPng(png) && png.length === r.screenshotBytes, "page.png is not the screenshot Playwright took");
  expect(r.requests?.document >= 2 && r.requests?.stylesheet >= 1, `the route did not see the page's requests: ${JSON.stringify(r.requests)}`);
  return `3 quotes (Einstein first) with locators; clicked Next to page 2 (Marilyn Monroe); a context route saw ${JSON.stringify(r.requests)}; page.png ${Math.round(png.length / 1024)} KB`;
});
