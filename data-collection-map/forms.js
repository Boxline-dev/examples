// Runs in the page (session.evaluate): every form, where it sends its data, and which kinds of personal data its
// fields ask for (from their type, autocomplete, name and label). One expression; returns plain JSON.
(() => {
  const KINDS = [
    ["payment card", /cc-|card|cvc|cvv|expir/i],
    ["password", /password|passwd/i],
    ["government id", /ssn|social.?security|passport|national.?id|tax.?id/i],
    ["birth date", /bday|birth|dob/i],
    ["email", /email|e-mail/i],
    ["phone", /tel|phone|mobile/i],
    ["address", /street|address|postal|postcode|zip|city|country/i],
    ["name", /^(cc-)?name$|full.?name|given-name|family-name|first.?name|last.?name|surname/i],
  ];
  const labelOf = (el) => (el.labels && el.labels[0] ? el.labels[0].textContent : el.getAttribute("aria-label") || el.placeholder || "").trim().replace(/\s+/g, " ");
  return [...document.forms].map((form) => {
    const fields = [...form.elements]
      .filter((el) => el.name && !["submit", "button", "reset", "image"].includes(el.type))
      .map((el) => {
        const hints = `${el.type} ${el.getAttribute("autocomplete") || ""} ${el.name} ${labelOf(el)}`;
        const kind = el.type === "hidden" ? null : (KINDS.find(([, re]) => re.test(el.type === "email" ? "email" : el.type === "tel" ? "tel" : el.type === "password" ? "password" : hints)) || [null])[0];
        return { name: el.name, type: el.type, label: labelOf(el), autocomplete: el.getAttribute("autocomplete"), kind };
      });
    return { action: form.action, method: (form.getAttribute("method") || "get").toLowerCase(), fields, kinds: [...new Set(fields.map((f) => f.kind).filter(Boolean))] };
  });
})()
