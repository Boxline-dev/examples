# Form anatomy

Take a web form apart without submitting it: every field with its label, type and rules, the messages the browser
itself shows for an empty and for a wrong value, the hidden fields (and whether one is a CSRF token), where and how it
posts, and warnings. For testing and documenting your own forms.

| | |
|---|---|
| Uses | a session, `evaluate` (`anatomy.js` in the page), `screenshot` |
| Needs | any plan; no model |
| Site | your form; the default is httpbin.org's demo order form; the runner uses a stand-in sign-up form |
| Output | `output/form.md` (a table of fields and messages), `output/form.png`, `output/result.json` |

Nothing is ever submitted: the browser's constraint validation (`checkValidity`) gives each field's message for an
empty value and for a value its type, pattern or range must refuse (`not-an-email`, one below `min`, `!!` for a
pattern), and the field is put back as it was. A minimum length is reported from the attribute: browsers only check
it for typed values. Warnings: a password without HTTPS, a password sent with GET, posting to another site, fields
without labels, and a POST form without a CSRF token among its hidden fields.

**Inputs** (environment variables): `FORM_URL`, `FORM_SELECTOR` (default: the form with the most fields).

## Run it

Put your API key in the environment (`export BOXLINE_API_KEY=bxl_…`, or copy `.env.example` to `.env` and run
`set -a; . ./.env; set +a`). `BOXLINE_API_URL` points the SDK at another API (default `https://api.boxline.dev`).

Node 18 or newer:

```bash
npm install @boxline/sdk tsx
npx tsx node/index.ts
```

Python 3.9 or newer:

```bash
pip install boxline-sdk
python python/main.py
```

Both write to `output/` (`OUTPUT_DIR` picks another folder) and release their sessions when they finish.

## The result check

`npx tsx check.ts output` reads what the example wrote and exits with 0 only when the result is right. A form was read
and every required field has the browser's message for an empty value. On the runner's stand-in form: it posts with a
CSRF token, full name, email and password are required, the browser refuses "not-an-email", age 17 and a bad
postcode, the password needs 12 characters, and the stand-in site saw no submission.
