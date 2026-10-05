# Solve and test

**Give your AI agents the infrastructure they need: browsers, shells, storage and isolated machines.**

An agent gets a programming exercise and a machine with a shell. It reads the instructions, writes `solution.py`, runs
the exercise's tests, reads what failed, fixes, and runs them again until they pass. Then the example runs the tests
itself, from a fresh download in another folder, so the result does not rest on what the agent says.

| | |
|---|---|
| Uses | `sessions.create` with `browser: false, shell: true`, `session.files`, `session.exec`, `agent.run` in that session (its shell tool), `agent.wait` with an output schema |
| Needs | a plan with shell sessions and agent runs |
| Site | the exercises and test cases of [Exercism's problem-specifications](https://github.com/exercism/problem-specifications) (MIT), downloaded in the machine |
| Output | `output/solution.py` and `output/result.json` (the agent's report, the example's own test run, the agent's shell commands) |

**Inputs** (environment variables):

- `EXERCISE`: the exercise's folder name in problem-specifications (default `roman-numerals`; also `isbn-verifier`,
  `word-count`, `largest-series-product`, …).

`run_tests.py` runs the exercise's canonical test cases without a test framework: each case calls
`solution.<property>(**input)` and compares the return value with the expected one; an expected error means the call
must raise. `python3 run_tests.py --signatures` prints the functions the solution needs, which go into the agent's
task. It suits the exercises whose cases call one function and compare its value (most of them); exercises built
around classes or several calls in a row are beyond it.

Why the second run: the agent's report is a claim. The example downloads the cases again into another folder, copies
only `solution.py` over, runs them, and compares the agent's copies of the tests with the originals, so a solution that
"passes" by changing the tests is caught.

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

`npx tsx check.ts output` exits with 0 only when every canonical case passes in the example's own run, the agent left
`run_tests.py` and `canonical-data.json` as they were, it used the shell and ran the tests itself, and the numbers it
reported are the ones the example measured.

