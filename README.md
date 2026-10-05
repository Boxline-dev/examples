# Boxline examples

**Give your AI agents the infrastructure they need: browsers, shells, storage and isolated machines.**

Runnable examples for the Node and Python SDKs, and integrations with other tools. Each one does a real job on
public demo sites or on "your site", and each has a **result check** that proves it worked, not just that it ran.
They are legitimate automation only (public pages, demo sites made for automation, your own sites and accounts),
respecting each site's terms and robots.txt; no mass sign-ups, spam or posting, no ticket or booking sniping, no
scraping behind someone else's login.

Every example folder has:

| File | What |
|---|---|
| `README.md` | what it does, what it needs (plan features, a model, a shell, keys), how to run it; the source of its docs page |
| `node/index.ts` | the Node version (TypeScript, runs with `npx tsx`), using `@boxline/sdk` |
| `python/main.py` | the Python version, using the `boxline` package (`pip install boxline-sdk`) |
| `.env.example` | `BOXLINE_API_KEY`, `BOXLINE_API_URL` and the example's own inputs |
| `check.ts` | the result check: `npx tsx check.ts output` exits with 0 only when the result is right (it uses `runner/check-lib.ts`, so it runs inside this folder tree) |

Both versions write the same `output/result.json` (and files), so one check covers both. They tag their sessions
with `userMetadata: {example: "<name>"}` and stop them when they finish.

## The examples

| Group | Example | Uses |
|---|---|---|
| Get started | [sessions-and-playwright](sessions-and-playwright) | session, Playwright over CDP, actions |
| Get started | [fetch-or-browser](fetch-or-browser) | fetch, a session driven by actions |
| Get started | [search-read-answer](search-read-answer) | search with fetch, extract |
| Data out | [product-to-json](product-to-json) | extract with a schema |
| Data out | [site-to-markdown](site-to-markdown) | crawl |
| Data out | [link-checker](link-checker) | crawl, fetch (links to other sites too) |
| Data out | [seo-audit](seo-audit) | crawl (HTML), extract |
| Data out | [prices-by-country](prices-by-country) | residential proxies, fetch, extract |
| Data out | [download-all-images](download-all-images) | Playwright, cookie export, shell, files |
| Documents | [financial-report-to-data](financial-report-to-data) | actions, shell (curl, pdftotext), extract |
| Logins | [save-a-login](save-a-login) | browser profiles, the live view |
| Logins | [my-invoices](my-invoices) | a profile, downloads, files |
| Logins | [hand-over-for-a-code](hand-over-for-a-code) | a credential (a secret) for the password, hand-over |
| Logins | [two-factor-sign-in](two-factor-sign-in) | a password credential with 2FA (`%NAME.otp%`) linked to a profile, agent run |
| Logins | [email-code-sign-in](email-code-sign-in) | a password credential whose codes you push (`codeSource: "push"`), `credentials.pushCode`, a `code` step in the run |
| Forms | [form-from-spreadsheet](form-from-spreadsheet) | shell, plain-English steps with variables, a review |
| Forms | [public-registry-lookup](public-registry-lookup) | agent run, extract |
| Forms | [company-details-from-legal-pages](company-details-from-legal-pages) | crawl, extract |
| Monitoring | [watch-a-price](watch-a-price) | task with an output schema and a schedule, `task_run.finished` webhook |
| Monitoring | [visual-uptime-check](visual-uptime-check) | a timed load check (session goto), task with screenshots, a schedule |
| Monitoring | [changelog-watcher](changelog-watcher) | task with an output schema and a schedule, a chat webhook |
| Monitoring | [security-headers-check](security-headers-check) | fetch, a shell-only session |
| AI agents | [research-a-question](research-a-question) | agent run with web search |
| AI agents | [agent-with-human-in-the-loop](agent-with-human-in-the-loop) | agent run, hand-over and hand-back |
| AI agents | [computer-use](computer-use) | agent run in mode "computer" |
| AI agents | [compare-models](compare-models) | a benchmark: agent runs per task and model, scored in code |
| Browser + shell | [download-and-add-up](download-and-add-up) | Playwright download, Python in the shell, a form |
| Browser + shell | [pdf-to-summary](pdf-to-summary) | shell (pdftotext), the extract action |
| Browser + shell | [screenshots-to-pdf](screenshots-to-pdf) | screenshots, Python (Pillow) in the shell |
| Browser + shell | [video-clip](video-clip) | shell (yt-dlp, ffmpeg) |
| Browser + shell | [test-my-staging-site](test-my-staging-site) | shell (git, npm test), the browser for failures |
| Browser + shell | [tables-to-csv](tables-to-csv) | tables read in the page (merged cells, two-row headers), CSV and sums in the shell |
| Browser + shell | [session-replay-gif](session-replay-gif) | a session's recording, ffmpeg in a shell-only session |
| Browser + shell | [solve-and-test](solve-and-test) | an agent run in a shell-only session, the tests rerun by the example |
| Browser + shell | [docs-to-working-code](docs-to-working-code) | an agent reads API docs in the browser, writes and runs a client in the shell |
| Browser + shell | [earnings-from-edgar](earnings-from-edgar) | SEC EDGAR's API in a shell-only session, growth and margins in Python, a chart |
| AI agents | [wiki-race](wiki-race) | an agent run that clicks links only, every hop checked with Wikipedia's API in the shell |
| Quality | [accessibility-check](accessibility-check) | shell, Playwright, axe-core |
| Quality | [dark-pattern-review](dark-pattern-review) | agent run in a session, evaluate (scan.js), the extract action |
| Chat and research | [chat-with-a-page](chat-with-a-page) | a session, the extract action per question, quotes checked |
| Chat and research | [company-research](company-research) | search, extract with cited pages |
| Chat and research | [compare-two-sites](compare-two-sites) | extract over two pages, screenshots |
| Chat and research | [watch-competitor-pages](watch-competitor-pages) | fetch hashes, extract on change, a chat webhook |
| Chat and research | [daily-tech-digest](daily-tech-digest) | shell (HN API, RSS, fpdf2 via setup), extract |
| Chat and research | [tech-signals](tech-signals) | shell (HN search API, wordfreq), extract per theme |
| Chat and research | [github-profile-summary](github-profile-summary) | extract, repositories cloned and measured in the shell |
| Chat and research | [ask-a-repo](ask-a-repo) | a browserless shell session, an agent run in it |
| Chat and research | [top-story-discussion](top-story-discussion) | HN API, extract with quotes checked |
| Chat and research | [bring-your-own-model](bring-your-own-model) | fetch to Markdown, your own OpenAI-compatible model |
| Chat and research | [changelog-between-refs](changelog-between-refs) | git in a shell session, an agent run, commits checked |
| Chat and research | [chat-with-a-video](chat-with-a-video) | subtitles in the shell, an agent run, moments checked |
| Chat and research | [article-to-speech](article-to-speech) | extract checked against fetch, espeak-ng and ffmpeg in the shell |
| Monitoring and drafts | [status-page-watch](status-page-watch) | extract onto fixed states, screenshots, a chat alert |
| Monitoring and drafts | [news-to-drafts](news-to-drafts) | fetch, extract; drafts for a person to review |
| Monitoring and drafts | [store-trust-check](store-trust-check) | shell (RDAP, the certificate), crawl, extract |
| Shopping and places | [product-alternatives](product-alternatives) | search, extract, prices remembered |
| Shopping and places | [local-businesses](local-businesses) | OpenStreetMap APIs from the shell, fetch |
| Shopping and places | [gift-ideas](gift-ideas) | search, extract with cited pages |
| Site quality | [ui-review](ui-review) | viewports, evaluate (measure.js), extract |
| Site quality | [data-collection-map](data-collection-map) | evaluate, the session's network log, cookie export |
| Site quality | [form-anatomy](form-anatomy) | evaluate (the browser's own validation) |
| Site quality | [hero-cta-review](hero-cta-review) | agent run in mode "computer", evaluate |
| Data for AI | [site-map](site-map) | crawl (HTML), sitemap.xml |
| Data for AI | [site-to-rag-chunks](site-to-rag-chunks) | crawl, chunks for embedding |
| Data for AI | [crawl-and-extract](crawl-and-extract) | crawl with include patterns, extract in batches |
| Data for AI | [page-resources](page-resources) | the session's network log (`data.bytes`) |
| Data for AI | [pages-to-dataset](pages-to-dataset) | search or addresses, fetch, extract with evidence |
| Data for AI | [context-pack](context-pack) | fetch, extract with quotes, a token budget |
| Proxies and CAPTCHAs | [weather-in-3-cities](weather-in-3-cities) | residential proxies by city, the realistic browser |
| Proxies and CAPTCHAs | [captcha-hand-over](captcha-hand-over) | CAPTCHA detection, a person in the live view |

**Skills** (`skills/`): Claude Code skills that read the web with Boxline: `/web` (a site map for agents),
`/design` (a site's design system, measured), `/learn` (a skill from today's docs), `/skill-tree` (a graph of linked
notes) and `/harness` (a CLAUDE.md from real mistakes). See [skills/README.md](skills/README.md).

**Integrations** (`integrations/`, each installs its own pinned packages in its folder, never in the monorepo):
[Playwright](integrations/playwright) (Node, Python), [Puppeteer](integrations/puppeteer) (Node),
[Stagehand](integrations/stagehand) (Node, v3), [Browser Use](integrations/browser-use) (Python),
[LangChain](integrations/langchain) (Node, Python), [CrewAI](integrations/crewai) (Python),
[Vercel AI SDK](integrations/vercel-ai-sdk) (Node), [OpenAI computer use](integrations/openai-computer-use) (Node,
Python) and [Claude computer use](integrations/claude-computer-use) (Node, Python). Those that call a model provider
themselves need your own `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`.

Every example of the catalogue is built. The task examples (Watch a price, Visual uptime check, Changelog watcher) run
their task once right away and switch their schedule off at the end unless `KEEP_SCHEDULE=1`, so trying them never
leaves a schedule running (and costing) by accident.

## Run one by hand

```bash
export BOXLINE_API_KEY=bxl_…                     # BOXLINE_API_URL for another API than https://api.boxline.dev
cd examples/product-to-json
npx tsx node/index.ts
python python/main.py                            # with the boxline package installed (pip install -r examples/requirements.txt)
npx tsx check.ts output
```

"Your site" examples take the site from environment variables (see each README). Where a README says what its check
proves "on the stand-in", that is the set of test pages each example runs against before a release (they are not in
this repository, and `site()` in a check is null without them); on your own pages the check's general rules apply.

---

This repository holds the Boxline examples. It is copied from Boxline's main repository on every change. Issues and pull requests are welcome here; accepted changes are made there and arrive with the next copy.
