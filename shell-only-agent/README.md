# Shell-only agent

**Give your AI agents the infrastructure they need: browsers, shells, storage and isolated machines.**

An agent run with no browser at all: `session: { browser: false, shell: true }` gives it a machine with only a shell
and a `/workspace` disk. The agent generates a CSV by a rule, computes statistics from it with Python and writes a
report. Then the example reads the files back through the API (`files.readText`) and recomputes every number itself,
so the result does not rest on what the agent says.

| | |
|---|---|
| Uses | `agent.run` with `session: { browser: false, shell: true }` and `keepSession`, `agent.wait`, `sessions.files.readText`, `sessions.get`, `sessions.stop` |
| Needs | a plan with shell sessions and agent runs |
| Site | none: the data is made up by a rule (240 rows, four regions) |
| Output | `output/sales.csv`, `output/stats.json`, `output/report.md` and `output/result.json` (what the agent wrote, what the rule gives, the agent's shell commands) |

The agent's task fixes the rule (`region = [north, south, east, west][i % 4]`, `units = (i * 37) % 23 + 1`,
`unit_price = 4.50 + (i % 5) * 1.25`) and the statistics to compute (totals, revenue by region, the top region, the mean,
median and population standard deviation of the units). Everything it needs is in Python's standard library.

Why the example computes them again: the agent's report is a claim. The example regenerates the 240 rows from the rule,
compares them with the agent's `sales.csv`, and computes the same statistics itself (in the language of the example).
The session is shell-only, so it has no `liveUrl`; the example prints and records that too.

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

Both write to `output/` (`OUTPUT_DIR` picks another folder) and stop their session when they finish.

## The result check

`npx tsx check.ts output` exits with 0 only when the run's session was shell-only (no browser, no `liveUrl`), `sales.csv`
has the 240 rows the rule gives, every statistic in the agent's `stats.json` equals the one the example computed (to a cent),
`report.md` shows the total revenue and names the top region, and the agent ran Python in the shell.

