"""Claude computer use with Boxline: your own loop with Claude's computer toolset (Messages API). Claude looks at
screenshots and answers with one tool_use block per action, named after the action (left_click, type, ...); each goes to
the session as {"action": <name>, **input} (POST /v1/sessions/:id/browser/computer), and the result goes back to Claude
with toolset_name "computer".

    pip install -r requirements.txt && python main.py     (BOXLINE_API_KEY and ANTHROPIC_API_KEY; CUA_MODEL, TASK)

The toolset sees only the page (there is no address bar): the loop opens the start page first. Writes output/result.json.
"""
import json
import os
from pathlib import Path

import anthropic

from boxline import Boxline

out = Path(os.environ.get("OUTPUT_DIR", "output"))
start = os.environ.get("START_URL", "https://books.toscrape.com/")
task = os.environ.get("TASK", "Open the Poetry category and tell me the title and price of the cheapest book in it.")
model = os.environ.get("CUA_MODEL", "claude-sonnet-5-5")  # any Claude 5.5 model: they take computer_toolset_20260801
MAX_WIDTH = 1024  # screenshots are this wide; Claude's coordinates are read in these pixels
client = anthropic.Anthropic()
bx = Boxline()

with bx.sessions.create(timeout=900, user_metadata={"example": "integrations/claude-computer-use"}) as session:
    print(f"Session: {session.id}", flush=True)
    session.goto(start)
    # No screen size: Claude's coordinates are in the pixels of the screenshots it gets (all MAX_WIDTH wide).
    tools = [{"type": "computer_toolset_20260801"}]
    messages = [{"role": "user", "content": f"{task} (The browser shows {start}.)"}]
    actions, tokens, answer = [], 0, ""
    for _ in range(30):
        # Streamed: a large max_tokens needs it. The conversation is only ever appended to (Claude's thinking is bound to it).
        with client.messages.stream(model=model, max_tokens=64000, tools=tools, messages=messages) as stream:
            res = stream.get_final_message()
        tokens += res.usage.input_tokens + res.usage.output_tokens
        messages.append({"role": "assistant", "content": res.content})
        uses = [b for b in res.content if b.type == "tool_use"]
        if not uses:
            answer = "\n".join(b.text for b in res.content if b.type == "text")
            break
        # A turn's actions run in order; after a failed one the rest are not run.
        results, failed = [], False
        for i, use in enumerate(uses):
            if failed:
                results.append({"type": "tool_result", "tool_use_id": use.id, "toolset_name": "computer", "is_error": True,
                                "content": "Not executed: an earlier computer action in this turn failed."})
                continue
            action = {**use.input, "action": use.name}
            after = session.computer(action, max_width=MAX_WIDTH)
            actions.append(action)
            print(f"-> {use.name}: {after['text']}")
            failed = not after["ok"]
            # The screen goes back with screenshot and zoom, a failed action and the turn's last action; others say what they did.
            show_screen = use.name in ("screenshot", "zoom") or failed or i == len(uses) - 1
            content = [{"type": "text", "text": (after.get("text") or "Done.") if after["ok"] else (after.get("error") or "the action failed")}]
            if show_screen and after.get("screenshot"):
                content.append({"type": "image", "source": {"type": "base64", "media_type": after["mimeType"], "data": after["screenshot"]}})
            results.append({"type": "tool_result", "tool_use_id": use.id, "toolset_name": "computer", "is_error": failed, "content": content})
        messages.append({"role": "user", "content": results})

    print(f"\n{answer}")
    out.mkdir(parents=True, exist_ok=True)
    (out / "result.json").write_text(json.dumps({"model": model, "task": task, "start": start, "answer": answer, "actions": actions,
                                                 "usage": {"ownModelTokens": tokens}}, indent=2, ensure_ascii=False))
