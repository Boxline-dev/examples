// Runs in the page (session.evaluate): what a dark-pattern review measures rather than guesses. One expression;
// returns plain JSON.
(() => {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const st = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && st.visibility !== "hidden" && st.display !== "none";
  };
  const text = (el) => (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
  const labelOf = (input) =>
    text(input.closest("label") || document.querySelector(`label[for="${CSS.escape(input.id || "-")}"]`) || { innerText: input.getAttribute("aria-label") || input.name || "" });
  // Ticked before the visitor did anything: the checked attribute in the page's own HTML.
  const preChecked = [...document.querySelectorAll('input[type="checkbox"], input[type="radio"]')]
    .filter((i) => i.defaultChecked && visible(i))
    .slice(0, 30)
    .map((i) => ({ type: i.type, name: i.name, label: labelOf(i).slice(0, 200) }));
  // Countdowns: elements named timer/countdown, or whose whole text is a clock (mm:ss, hh:mm:ss).
  const timers = [...document.querySelectorAll("body *")]
    .filter((el) => el.children.length === 0 && visible(el))
    .filter((el) => /timer|countdown|clock/i.test(`${el.id} ${el.className}`) || /^\d{1,2}:\d{2}(:\d{2})?$/.test(text(el)))
    .slice(0, 10)
    .map((el) => ({ id: el.id || null, text: text(el), context: text(el.parentElement || el).slice(0, 160) }));
  // Small or faint print that talks about money, renewals or cancelling.
  const smallPrint = [...document.querySelectorAll("p, span, small, div, li, td, label")]
    .filter((el) => visible(el) && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))
    .map((el) => ({ el, st: getComputedStyle(el) }))
    .filter(({ el, st }) => parseFloat(st.fontSize) < 11 && /[$€£]|\d+%|renew|month|year|cancel|trial|fee|subscription/i.test(text(el)))
    .slice(0, 20)
    .map(({ el, st }) => ({ text: text(el).slice(0, 300), fontSize: parseFloat(st.fontSize), color: st.color }));
  // Pop-ups and their choices (the wording of a "no" is where confirmshaming lives).
  const dialogs = [...document.querySelectorAll('[role="dialog"], [role="alertdialog"], dialog, .modal, .popup')]
    .filter(visible)
    .slice(0, 10)
    .map((d) => ({ text: text(d).slice(0, 400), choices: [...d.querySelectorAll("button, a, [role=button]")].map(text).filter(Boolean).slice(0, 8) }));
  // Lines that name a fee or charge with its amount (the example compares them with the pages before).
  const charges = [
    ...new Set(
      [...document.querySelectorAll("tr, li, p, dd, dt, span, div")]
        .filter((el) => visible(el) && el.querySelectorAll("tr, li, p, div").length === 0)
        .map(text)
        .filter((t) => t.length < 160 && /(fee|charge|surcharge|service|handling|processing|booking|convenience)[^$€£]{0,40}[$€£]\s?\d/i.test(t)),
    ),
  ].slice(0, 20);
  const body = text(document.body);
  return {
    url: location.href,
    title: document.title,
    text: body.slice(0, 8000),
    preChecked,
    timers,
    smallPrint,
    dialogs,
    charges,
    prices: [...new Set(body.match(/[$€£]\s?\d[\d,]*(\.\d{2})?(\s?\/\s?(month|mo|year|yr))?/g) || [])].slice(0, 40),
  };
})()
