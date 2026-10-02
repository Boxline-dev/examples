"""Chat with a page: open a page once in a session, then ask questions about it. Each answer comes from the page
that is open in the browser (session.extract), with the chat so far, and quotes the sentence it is based on.

    python python/main.py            (BOXLINE_API_KEY; PAGE_URL for another page)

QUESTIONS="first?|second?" answers those and stops; without it, type questions and "exit" to stop.
Writes output/result.json and output/page.md (the page as the model read it).
"""
import json
import os
from pathlib import Path

from boxline import Boxline

out = Path(os.environ.get("OUTPUT_DIR", "output"))
url = os.environ.get("PAGE_URL", "https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html")
preset = [q.strip() for q in os.environ["QUESTIONS"].split("|") if q.strip()] if os.environ.get("QUESTIONS") else None
bx = Boxline()

SCHEMA = {
    "type": "object",
    "properties": {
        "answer": {"type": "string", "description": "a short answer, from this page only"},
        "quote": {"type": "string", "description": "the exact words on the page the answer is based on, copied as they are; empty when the page does not say"},
        "found": {"type": "boolean", "description": "false when the page does not answer the question"},
    },
    "required": ["answer", "quote", "found"],
}

turns, model_usd = [], 0.0
with bx.sessions.create(timeout=900, idle_timeout=300, user_metadata={"example": "chat-with-a-page"}) as session:
    print(f"Session: {session.id}", flush=True)
    opened = session.goto(url, wait_until="load")
    page = session.content("markdown")
    print(f'Opened {page["url"]} ("{page["title"]}"), {len(page["content"])} characters. Ask about it (type "exit" to stop).\n', flush=True)
    out.mkdir(parents=True, exist_ok=True)
    (out / "page.md").write_text(page["content"])

    i = 0
    while True:
        if preset is not None:
            question = preset[i] if i < len(preset) else ""
            if question:
                print(f"You: {question}")
        else:
            question = input("You: ").strip()
        i += 1
        if not question or question.lower() == "exit":
            break
        # The chat so far goes into the instruction, so follow-up questions ("and the one after that?") make sense.
        history = "\n".join(f"Q: {t['question']}\nA: {t['answer']}" for t in turns)
        r = session.extract(
            (f"The conversation so far:\n{history}\n\n" if history else "") + f"Answer this question about the page: {question}",
            schema=SCHEMA,
        )
        model_usd += r["usage"]["costUsd"]
        if not r["data"]["found"] and not r["data"]["answer"].strip():
            r["data"]["answer"] = "The page does not say."
        turns.append({"question": question, **r["data"]})
        quote = f'\n    (the page: "{r["data"]["quote"]}")' if r["data"]["quote"] else ""
        print(f'AI: {r["data"]["answer"]}{quote}\n', flush=True)

    result = {"url": url, "finalUrl": page["url"], "title": page["title"], "status": opened["status"], "turns": turns, "usage": {"modelUsd": model_usd}}
    (out / "result.json").write_text(json.dumps(result, indent=2, ensure_ascii=False))
    print(f"{len(turns)} answers for ${model_usd:.4f} of model use.")
