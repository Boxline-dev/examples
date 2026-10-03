# Email-code sign-in

Some sites email a one-time code (or a sign-in link) after the password. Save the password as a credential whose
codes you send yourself (`codeSource: "push"`). An agent run signs in with `%NAME.username%`, `%NAME.password%` and
`%NAME.otp%`; when it reaches the code field it **waits**. You hear of it (a `code` step in the run, and the webhook
`credential.code_needed`), read the email, and send the code with `credentials.pushCode`. The platform types it. The model
never sees the password or the code, and a code is used once, by the wait it was sent for.

| | |
|---|---|
| Uses | `credentials.create` (a password with `codeSource: "push"`), `agent.run` with `credentials`, `agent.stream` (the `code` step), `credentials.pushCode`, `credentials.audit` |
| Needs | a plan with password credentials (`loginDetails`), and a model on the API |
| Site | your sign-in page that emails a code (`SIGNIN_URL`) and a way for your system to read that email (`MAILBOX_URL`). The runner uses its stand-in: a password page, then a random one-time code "emailed" to a mailbox it serves like a mail provider's API |
| Output | `output/result.json` with the run's code steps (`waiting`, `received`), when the code was sent and the credential's audit (never a value) |

**Inputs** (environment variables):

- `SIGNIN_URL`: your sign-in page (required).
- `SITE_USERNAME`: your user name or email.
- `SITE_PASSWORD`: your password (keep it in the environment, never in code).
- `MAILBOX_URL`: where your system reads the site's email: an address that answers
  `{"messages": [{"text": "...", "receivedAt": "<iso time>"}]}`, newest first. The example takes the first 6-digit
  number of the newest message that arrived after it started. With a real site, change `readCode()` (`read_code()` in
  Python) to read your own mailbox, or send the code from the handler of an inbound-email webhook instead.
- `CREDENTIAL_NAME`: the credential's name (default `EMAIL_CODE_EXAMPLE`).

The wait only uses a code that arrives **after** it began (an older one is never used), so the example reads the mailbox
when the run says it waits, not before. A sign-in link works the same way: `credentials.pushCode(name, { link })`, and the
agent's `browser_open_link` tool opens it (it must be on the credential's sites). To skip the agent and sign in with one
call, use `session.login(name)`; it waits for a pushed code in the same way.

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

Both write to `output/` (`OUTPUT_DIR` picks another folder), release their session and delete the credential they made
when they finish.

## The result check

`npx tsx check.ts output` reads what the example wrote and exits with 0 only when the result is right. On the stand-in,
the site saw the password, emailed a code, and then got that same code typed after the example sent it; the run's code
steps were `waiting` then `received`; the answer names the signed-in user; and neither the stored run, the credential's
audit nor the result holds the code or the password.

