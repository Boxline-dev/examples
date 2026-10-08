"""OpenAI computer use with Boxline: your own loop with OpenAI's computer tool (Responses API, {"type": "computer"}).
The model looks at screenshots and answers with computer_calls; each action goes to the session unchanged
(POST /v1/sessions/:id/browser/computer), and the screen after it goes back to the model.

    pip install -r requirements.txt && python main.py     (BOXLINE_API_KEY and OPENAI_API_KEY; CUA_MODEL, TASK)

The tool sees only the page (there is no address bar): the loop opens the start page first. When OpenAI asks for a
safety check, a person confirms in the terminal; the loop never acknowledges one by itself. Writes output/result.json.
"""
import json
import os
from pathlib import Path

from openai import OpenAI

from boxline import Boxline

out = Path(os.environ.get("OUTPUT_DIR", "output"))
start = os.environ.get("START_URL", "https://books.toscrape.com/")
task = os.environ.get("TASK", "Open the Poetry category and tell me the title and price of the cheapest book in it.")
model = os.environ.get("CUA_MODEL", "gpt-6-luna")
MAX_WIDTH = 1024  # screenshots are this wide; the model's coordinates are read in these pixels
client = OpenAI()
bx = Boxline()


def image(screen: dict) -> str:
    return f"data:{screen['mimeType']};base64,{screen['screenshot']}"


with bx.sessions.create(timeout=900, user_metadata={"example": "integrations/openai-computer-use"}) as session:
    print(f"Session: {session.id}", flush=True)
    session.goto(start)
    first = session.computer({"type": "screenshot"}, max_width=MAX_WIDTH)
    items = [{"role": "user", "content": [{"type": "input_text", "text": f"{task} (The browser shows {start}.)"},
                                          {"type": "input_image", "image_url": image(first), "detail": "auto"}]}]
    previous, actions, tokens, answer = None, [], 0, ""
    for _ in range(30):
        res = client.responses.create(model=model, tools=[{"type": "computer"}], input=items, max_output_tokens=4000,
                                      **({"previous_response_id": previous} if previous else {}))
        previous = res.id
        tokens += (res.usage.input_tokens + res.usage.output_tokens) if res.usage else 0
        calls = [o for o in res.output if o.type == "computer_call"]
        if not calls:
            answer = res.output_text
            break
        items = []
        for call in calls:
            checks = call.pending_safety_checks or []
            if checks:
                ok = input(f"OpenAI asks a person to confirm: {'; '.join(c.message or c.code or '' for c in checks)}. Go on? (yes/no) ")
                if ok.strip().lower() not in ("y", "yes"):
                    raise SystemExit("stopped: the safety check was not confirmed")
            # One computer_call can carry several actions; only the last needs a screenshot.
            batch = [a.model_dump(exclude_none=True) for a in (call.actions or ([call.action] if call.action else []))]
            screen = None
            for i, action in enumerate(batch):
                screen = session.computer(action, max_width=MAX_WIDTH, screenshot=i == len(batch) - 1)
                actions.append(action)
                print(f"-> {action['type']}: {screen['text']}")
            if not screen or not screen.get("screenshot"):
                screen = session.computer({"type": "screenshot"}, max_width=MAX_WIDTH)
            items.append({
                "type": "computer_call_output",
                "call_id": call.call_id,
                "output": {"type": "computer_screenshot", "image_url": image(screen)},
                **({"acknowledged_safety_checks": [{"id": c.id, "code": c.code, "message": c.message} for c in checks]} if checks else {}),
            })

    print(f"\n{answer}")
    out.mkdir(parents=True, exist_ok=True)
    (out / "result.json").write_text(json.dumps({"model": model, "task": task, "start": start, "answer": answer, "actions": actions,
                                                 "usage": {"ownModelTokens": tokens}}, indent=2, ensure_ascii=False))
