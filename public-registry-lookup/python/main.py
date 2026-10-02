"""Public registry lookup: an agent finds a company in the UK's public company register (Companies House), then
extract reads its record into JSON with a schema.

    python python/main.py            (BOXLINE_API_KEY; COMPANY for another company)

Writes output/record.json.
"""
import json
import os
import re
from pathlib import Path

from boxline import Boxline

out = Path(os.environ.get("OUTPUT_DIR", "output"))
company = os.environ.get("COMPANY", "ARM LIMITED")
REGISTER = "https://find-and-update.company-information.service.gov.uk"
bx = Boxline()

# 1. The agent searches the register and opens the company's overview page (it chooses among similar names).
run = bx.agent.run(
    f'Find the company "{company}" on the UK Companies House register ({REGISTER}): search for it and open its overview page. '
    "Reply with the address of that overview page only.",
    max_steps=15,
)
print(f"Agent run {run['id']} ({run['provider']}/{run['model']}) · Session: {run['sessionId']}", flush=True)
for e in bx.agent.stream(run["id"]):
    if e["type"] == "tool":
        print(f"-> {e['name']} {json.dumps(e.get('input') or {})[:100]}")
    elif e["type"] == "done":
        print(f"{e['status']}: {e.get('result') or e.get('error')}")
done = bx.agent.get(run["id"])
m = re.search(r"https://find-and-update\.company-information\.service\.gov\.uk/company/[A-Z0-9]+", done["result"] or "", re.I)
if not m:
    raise SystemExit(f"the agent did not find the company's page: {done['result'] or done['error']}")
page = m.group(0)

# 2. extract reads the record on that page into a fixed shape.
r = bx.extract(
    url=page,
    prompt="The company record on this page.",
    schema={
        "type": "object",
        "properties": {
            "companyNumber": {"type": "string"},
            "name": {"type": "string"},
            "status": {"type": "string"},
            "type": {"type": "string", "description": "the company type, e.g. Private limited company"},
            "incorporated": {"type": "string", "description": "the incorporation date as YYYY-MM-DD"},
            "registeredOffice": {"type": "string", "description": "the registered office address on one line"},
        },
        "required": ["companyNumber", "name", "status", "type", "incorporated", "registeredOffice"],
    },
)
record = r["data"]
print(json.dumps(record, indent=2))

out.mkdir(parents=True, exist_ok=True)
(out / "record.json").write_text(json.dumps(record, indent=2))
result = {"company": company, "page": page, "record": record, "agentRuns": [{"id": run["id"]}], "usage": {"modelUsd": r["usage"]["costUsd"]}}
(out / "result.json").write_text(json.dumps(result, indent=2))
