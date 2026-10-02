"""LangChain with Boxline: two LangChain tools backed by Boxline, given to a LangChain agent (create_agent) on your
own OpenAI key: `boxline_fetch` reads a page in a sandboxed browser, and `boxline_browser_agent` hands a whole browser
task (clicking, typing, several pages) to a Boxline agent run.

    pip install -r requirements.txt && python main.py     (BOXLINE_API_KEY and OPENAI_API_KEY; LC_MODEL, QUESTION)

Writes output/result.json: the answer and every tool call.
"""
import json
import os
from pathlib import Path

from langchain.agents import create_agent
from langchain.tools import tool
from langchain_openai import ChatOpenAI

from boxline import Boxline

out = Path(os.environ.get("OUTPUT_DIR", "output"))
question = os.environ.get("QUESTION", 'On books.toscrape.com, what does "Sapiens: A Brief History of Humankind" cost, and how many are in stock?')
bx = Boxline()
boxline_runs = []


@tool
def boxline_fetch(url: str) -> str:
    """Open a web page in a real browser (in a Boxline sandbox) and return it as Markdown with its links."""
    page = bx.fetch(url, format="markdown", links=True)
    return json.dumps({"url": page["finalUrl"], "status": page["status"], "title": page["title"], "content": page["content"][:12_000],
                       "links": (page.get("links") or [])[:80]})


@tool
def boxline_browser_agent(task: str) -> str:
    """Give a browser task that needs clicking, typing or several pages to an AI agent with its own browser. Returns its answer."""
    run = bx.agent.run(task, max_steps=20)
    boxline_runs.append({"id": run["id"]})
    done = bx.agent.wait(run["id"], timeout=480)
    if done["status"] != "completed":
        return f"The browser agent {done['status']}: {done.get('error') or ''}"
    return done["result"] or ""


agent = create_agent(
    # The Responses API: newer OpenAI models take function tools only there.
    ChatOpenAI(model=os.environ.get("LC_MODEL", "gpt-6-luna"), use_responses_api=True),
    tools=[boxline_fetch, boxline_browser_agent],
    system_prompt="Answer from pages you read with the tools. Prefer boxline_fetch; use boxline_browser_agent only when a task needs clicking or typing.",
)
result = agent.invoke({"messages": [{"role": "user", "content": question}]})

calls = [{"tool": c["name"], "input": c["args"]} for m in result["messages"] for c in (getattr(m, "tool_calls", None) or [])]
answer = result["messages"][-1].text  # joins the message's text blocks
for c in calls:
    print(f"-> {c['tool']} {json.dumps(c['input'])}")
print(f"\n{answer}")
out.mkdir(parents=True, exist_ok=True)
(out / "result.json").write_text(json.dumps({"question": question, "answer": answer, "calls": calls, "agentRuns": boxline_runs}, indent=2, ensure_ascii=False))
