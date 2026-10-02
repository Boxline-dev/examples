"""CrewAI with Boxline: a CrewAI tool (BaseTool) that reads pages through Boxline, used by a one-agent crew on your
own OpenAI key. Each page renders in a real browser inside a Boxline sandbox, never on this computer.

    pip install -r requirements.txt && python main.py     (BOXLINE_API_KEY and OPENAI_API_KEY; CREW_MODEL, QUESTION)

Writes output/result.json: the answer and every tool call.
"""
import json
import os
from pathlib import Path

from crewai import LLM, Agent, Crew, Task
from crewai.tools import BaseTool
from pydantic import BaseModel, Field

from boxline import Boxline

out = Path(os.environ.get("OUTPUT_DIR", "output"))
question = os.environ.get("QUESTION", 'On books.toscrape.com, what does "Sapiens: A Brief History of Humankind" cost, and how many are in stock?')
bx = Boxline()
calls = []


class FetchInput(BaseModel):
    url: str = Field(..., description="an http(s) address")


class BoxlineFetchTool(BaseTool):
    name: str = "boxline_fetch"
    description: str = "Open a web page in a real browser (in a Boxline sandbox) and return it as Markdown with its links."
    args_schema: type[BaseModel] = FetchInput

    def _run(self, url: str) -> str:
        calls.append({"tool": self.name, "input": {"url": url}})
        page = bx.fetch(url, format="markdown", links=True)
        return json.dumps({"url": page["finalUrl"], "status": page["status"], "title": page["title"], "content": page["content"][:12_000],
                           "links": (page.get("links") or [])[:80]})


checker = Agent(
    role="Web researcher",
    goal="Answer questions about web pages from what the pages say",
    backstory="You read pages with the boxline_fetch tool and quote exact figures.",
    tools=[BoxlineFetchTool()],
    llm=LLM(model=os.environ.get("CREW_MODEL", "openai/gpt-6-luna")),
    verbose=False,
)
task = Task(description=question, expected_output="The answer with the exact figures, and the address of the page they came from.", agent=checker)
output = Crew(agents=[checker], tasks=[task], verbose=False).kickoff()

answer = output.raw
for c in calls:
    print(f"-> {c['tool']} {json.dumps(c['input'])}")
print(f"\n{answer}")
out.mkdir(parents=True, exist_ok=True)
usage = output.token_usage.total_tokens if output.token_usage else 0
(out / "result.json").write_text(json.dumps({"question": question, "answer": answer, "calls": calls, "usage": {"ownModelTokens": usage}}, indent=2, ensure_ascii=False))
