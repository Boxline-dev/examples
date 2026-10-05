"""Browser Use with Boxline: a Browser Use agent (on your own OpenAI key) drives a Boxline session's browser,
connected by its CDP address (`Browser(cdp_url=...)`). Nothing is launched on this computer.

    pip install -r requirements.txt && python main.py     (BOXLINE_API_KEY and OPENAI_API_KEY; BU_MODEL, TASK)

Writes output/result.json: the answer, the pages visited and the number of steps.
"""
import asyncio
import json
import os
from pathlib import Path

from browser_use import Agent, Browser, ChatOpenAI

from boxline import AsyncBoxline

out = Path(os.environ.get("OUTPUT_DIR", "output"))
task = os.environ.get("TASK", "Open https://books.toscrape.com, go to the Poetry category, and tell me the title and price of the cheapest book in it.")


async def main() -> None:
    async with AsyncBoxline() as bx:
        # keep_alive on both sides: the session stays up while Browser Use connects, until it is stopped below.
        session = await bx.sessions.create(timeout=600, keep_alive=True, user_metadata={"example": "integrations/browser-use"})
        print(f"Session: {session.id}", flush=True)
        browser = Browser(cdp_url=session.connect_url, keep_alive=True)  # a signed address: treat it like a password
        try:
            # Newer OpenAI models take only their default temperature: leave Browser Use's sampling settings unset.
            llm = ChatOpenAI(model=os.environ.get("BU_MODEL", "gpt-6-luna"), temperature=None, frequency_penalty=None)
            agent = Agent(task=task, llm=llm, browser=browser)
            history = await agent.run(max_steps=25)
            answer = history.final_result() or ""
            print(f"\n{answer}")
            out.mkdir(parents=True, exist_ok=True)
            result = {"task": task, "answer": answer, "done": history.is_done(), "successful": history.is_successful(),
                      "steps": history.number_of_steps(), "urls": [u for u in history.urls() if u]}
            (out / "result.json").write_text(json.dumps(result, indent=2, ensure_ascii=False))
        finally:
            await browser.stop()  # disconnects Browser Use (the browser itself keeps running)...
            await session.stop()  # ...until the session is stopped: that saves it and ends its billing


asyncio.run(main())
