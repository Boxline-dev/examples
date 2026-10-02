// A function of the form's CSS selector (empty: the form with the most fields). Runs in the page (session.evaluate)
// and takes the form apart without submitting it: its fields and their rules, the browser's own validation messages
// for an empty and for a wrong value (checkValidity, never submit), hidden fields, and where and how it posts.
(selector) => {
  const form = selector ? document.querySelector(selector) : [...document.forms].sort((a, b) => b.elements.length - a.elements.length)[0];
  if (!form) return null;
  const labelOf = (el) => (el.labels && el.labels[0] ? el.labels[0].textContent : el.getAttribute("aria-label") || el.placeholder || "").trim().replace(/\s+/g, " ");
  // A value each type should refuse (programmatic values are checked for type, pattern, min and max; not for minlength).
  const wrong = (el) => {
    if (el.type === "email") return "not-an-email";
    if (el.type === "url") return "not a url";
    if (el.type === "number" && el.min !== "") return String(Number(el.min) - 1);
    if (el.type === "number" && el.max !== "") return String(Number(el.max) + 1);
    if (el.pattern) return "!!";
    return null;
  };
  const fields = [];
  const hidden = [];
  for (const el of form.elements) {
    if (!el.name || ["submit", "button", "reset", "image"].includes(el.type)) continue;
    if (el.type === "hidden") {
      hidden.push({ name: el.name, looksLikeToken: /csrf|xsrf|token|authenticity|nonce/i.test(el.name) && (el.value || "").length >= 6 });
      continue;
    }
    const kept = el.type === "checkbox" || el.type === "radio" ? el.checked : el.value;
    el.checkValidity();
    const emptyMessage = el.validationMessage || null;
    const bad = wrong(el);
    let invalidMessage = null;
    if (bad !== null) {
      el.value = bad;
      el.checkValidity();
      invalidMessage = el.validationMessage || null;
    }
    if (el.type === "checkbox" || el.type === "radio") el.checked = kept;
    else el.value = kept;
    const attr = (n) => el.getAttribute(n);
    fields.push({ name: el.name, label: labelOf(el), type: el.type, required: el.required, minlength: attr("minlength"), maxlength: attr("maxlength"), min: attr("min"), max: attr("max"), pattern: attr("pattern"), title: attr("title"), autocomplete: attr("autocomplete"), emptyMessage, invalidExample: bad, invalidMessage });
  }
  const action = new URL(form.action, location.href);
  const warnings = [];
  const hasPassword = fields.some((f) => f.type === "password");
  if (hasPassword && location.protocol !== "https:") warnings.push("a password field on a page without HTTPS");
  if (hasPassword && action.protocol !== "https:") warnings.push("the password is posted without HTTPS");
  if (action.host !== location.host) warnings.push(`it posts to another site: ${action.host}`);
  if ((form.getAttribute("method") || "get").toLowerCase() === "get" && hasPassword) warnings.push("a password sent with GET ends up in the address and logs");
  for (const f of fields) if (!f.label) warnings.push(`the field ${f.name} has no label`);
  if (form.method === "post" && !hidden.some((h) => h.looksLikeToken)) warnings.push("no CSRF token among the hidden fields (the site may use a cookie or header instead)");
  return {
    page: location.href,
    action: action.href,
    method: (form.getAttribute("method") || "get").toLowerCase(),
    enctype: form.enctype,
    target: form.target || null,
    novalidate: form.noValidate,
    scriptedSubmit: Boolean(form.getAttribute("onsubmit")),
    fields,
    hidden,
    csrfToken: hidden.some((h) => h.looksLikeToken),
    warnings,
  };
}
