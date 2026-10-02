"""Claude computer use with Boxline: your own loop with Claude's computer tool (Messages API, beta). Claude looks at
screenshots and answers with tool_use blocks; each block's input goes to the session unchanged
(POST /v1/sessions/:id/computer), and the screen after it goes back to Claude as the tool result.

    pip install -r requirements.txt && python main.py     (BOXLINE_API_KEY and ANTHROPIC_API_KEY; CUA_MODEL, TASK)

The tool sees only the page (there is no address bar): the loop opens the start page first. Writes output/result.json.
"""
import json
import os
from pathlib import Path

import anthropic

from boxline import Boxline

out = Path(os.environ.get("OUTPUT_DIR", "output"))
start = os.environ.get("START_URL", "https://books.toscrape.com/")
task = os.environ.get("TASK", "Open the Poetry category and tell me the title and price of the cheapest book in it.")
model = os.environ.get("CUA_MODEL", "claude-sonnet-5")  # computer_20251124; claude-haiku-4-5 uses computer_20250124
MAX_WIDTH = 1024  # screenshots are this wide; Claude's coordinates are read in these pixels
client = anthropic.Anthropic()
bx = Boxline()

with bx.sessions.create(timeout=900, user_metadata={"example": "integrations/claude-computer-use"}) as session:
    print(f"Session: {session.id}", flush=True)
    session.goto(start)
    # The display size Claude is told is the size of the screenshots it gets.
    screen = session.computer({"action": "screenshot"}, max_width=MAX_WIDTH)
    tool = {"type": "computer_20251124", "name": "computer", "display_width_px": screen["width"], "display_height_px": screen["height"]}
    messages = [{"role": "user", "content": f"{task} (The browser shows {start}.)"}]
    actions, tokens, answer = [], 0, ""
    for _ in range(30):
        res = client.beta.messages.create(model=model, max_tokens=4096, tools=[tool], messages=messages, betas=["computer-use-2025-11-24"])
        tokens += res.usage.input_tokens + res.usage.output_tokens
        messages.append({"role": "assistant", "content": res.content})
        uses = [b for b in res.content if b.type == "tool_use"]
        if not uses:
            answer = "\n".join(b.text for b in res.content if b.type == "text")
            break
        results = []
        for use in uses:
            after = session.computer(use.input, max_width=MAX_WIDTH)
            actions.append(use.input)
            print(f"-> {use.input.get('action')}: {after['text']}")
            content = [] if after["ok"] else [{"type": "text", "text": after.get("error") or "the action failed"}]
            if after.get("screenshot"):
                content.append({"type": "image", "source": {"type": "base64", "media_type": after["mimeType"], "data": after["screenshot"]}})
            results.append({"type": "tool_result", "tool_use_id": use.id, "is_error": not after["ok"], "content": content})
        messages.append({"role": "user", "content": results})

    print(f"\n{answer}")
    out.mkdir(parents=True, exist_ok=True)
    (out / "result.json").write_text(json.dumps({"model": model, "task": task, "start": start, "answer": answer, "actions": actions,
                                                 "usage": {"ownModelTokens": tokens}}, indent=2, ensure_ascii=False))
