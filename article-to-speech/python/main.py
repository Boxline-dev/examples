"""Article to speech: turn a web article into an MP3 you can listen to. The article's own paragraphs are taken from the
page (menus, captions and footers left out) and checked word for word against it, then spoken offline in a
session's shell (espeak-ng, installed by the session's setup) and encoded with ffmpeg. No speech API key needed.

    python python/main.py            (BOXLINE_API_KEY; ARTICLE_URL, MAX_WORDS, VOICE, SPEED; a plan with shell sessions)

Writes output/article.mp3, output/article.txt and output/result.json.
"""
import json
import os
import re
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from boxline import Boxline

out = Path(os.environ.get("OUTPUT_DIR", "output"))
url = os.environ.get("ARTICLE_URL", "https://en.wikipedia.org/wiki/Urban_forest")
max_words = int(os.environ.get("MAX_WORDS", "250"))
voice = os.environ.get("VOICE", "en-us")
speed = int(os.environ.get("SPEED", "165"))  # words per minute
bx = Boxline()


def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", re.sub(r"\[\d+\]", "", s.lower())).strip()


# 1. The article's own paragraphs, word for word, and the page's text to check them against.
with ThreadPoolExecutor(2) as pool:
    got = pool.submit(
        bx.extract,
        url=url,
        prompt=f"The article on this page: its title, and its paragraphs copied word for word, in order, without menus, captions, footnotes, footers or ads. Stop after about {max_words} words, at the end of a paragraph.",
        schema={"type": "object", "properties": {"title": {"type": "string"}, "paragraphs": {"type": "array", "items": {"type": "string"}}}, "required": ["title", "paragraphs"]},
    )
    page = pool.submit(bx.fetch, url, format="text").result()
    r = got.result()
page_text = norm(page["content"])
# A paragraph that is not on the page as written (the model rewrote it) is not read out.
paragraphs = [p for p in r["data"]["paragraphs"] if norm(p)[:120] in page_text]
text = "\n\n".join([r["data"]["title"], *paragraphs])
words = len(text.split())
print(f"\"{r['data']['title']}\": {len(paragraphs)} of {len(r['data']['paragraphs'])} paragraphs match the page word for word; {words} words")
if not paragraphs:
    raise SystemExit("no paragraph could be checked against the page")

# 2. Speech, made in the machine.
setup = ["sudo DEBIAN_FRONTEND=noninteractive apt-get update -qq && sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends espeak-ng >/dev/null"]
with bx.sessions.create(browser=False, shell=True, setup=setup, timeout=600, idle_timeout=300, user_metadata={"example": "article-to-speech"}) as session:
    print(f"Session: {session.id}", flush=True)
    session.files.write("article.txt", text)
    sh = session.exec(
        'espeak-ng -v "$VOICE" -s "$SPEED" -f article.txt -w article.wav && ffmpeg -loglevel error -y -i article.wav -metadata title="$TITLE" -codec:a libmp3lame -qscale:a 5 article.mp3 && ffprobe -v error -show_entries format=duration -of csv=p=0 article.mp3',
        env={"VOICE": voice, "SPEED": str(speed), "TITLE": r["data"]["title"]},
        timeout_ms=300_000,
    )
    if sh["exitCode"] != 0:
        raise SystemExit(f"speech failed: {sh['stderr'].strip()}")
    duration = round(float(sh["stdout"].strip()), 1)
    out.mkdir(parents=True, exist_ok=True)
    (out / "article.mp3").write_bytes(session.files.read("article.mp3"))
    (out / "article.txt").write_text(text)
print(f"article.mp3: {duration} s ({voice}, {speed} words per minute)")
result = {"url": url, "title": r["data"]["title"], "paragraphs": paragraphs, "dropped": len(r["data"]["paragraphs"]) - len(paragraphs), "words": words, "voice": voice, "speed": speed, "durationSeconds": duration, "usage": {"modelUsd": r["usage"]["costUsd"]}}
(out / "result.json").write_text(json.dumps(result, indent=2, ensure_ascii=False))
