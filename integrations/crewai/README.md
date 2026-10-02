# CrewAI with Boxline

A CrewAI tool (`BaseTool`) that reads pages through Boxline, used by a one-agent crew on your own OpenAI key. Each page renders in a real browser inside a Boxline sandbox.

Subclass `crewai.tools.BaseTool` with `name`, `description`, `args_schema` and `_run`; give it to an `Agent` with `LLM(model="openai/...")`, then `Crew(...).kickoff()`.

**Needs:** any plan; your own OpenAI key; Python 3.10 to 3.13 (CrewAI does not support 3.14 yet). **Site:** books.toscrape.com or quotes.toscrape.com, demo sites made for scraping practice.

**Environment:** `BOXLINE_API_KEY`, `OPENAI_API_KEY` (your OpenAI key: CrewAI calls OpenAI itself), `CREW_MODEL` (the model, as provider/model; default `openai/gpt-6-luna`), `QUESTION` (your own question).

## Run it

Python 3.10 to 3.13 or newer, in `python/`:

```bash
cd python
pip install -r requirements.txt && python main.py
```

The packages are pinned in the folder's own `package.json` / `requirements.txt`. The example writes to
`output/` (`OUTPUT_DIR` picks another folder) and releases its session when it finishes.

## The result check

`npx tsx check.ts output` reads what the example wrote and exits with 0 only when the result is right. It checks that the crew used the Boxline tool and answered with the price and stock the demo shop shows.
