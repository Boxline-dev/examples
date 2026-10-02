"""Chat with a video: ask questions about a video and get answers from what is said in it, each with the moments
(mm:ss) to jump to. The subtitles are fetched into a session's shell (a .srt or .vtt file, or with yt-dlp for videos
you may download), and an agent in that session answers from the transcript; every timestamp it cites is checked.

    python python/main.py            (BOXLINE_API_KEY; SUBTITLES_URL or VIDEO_URL; QUESTIONS separated by |)

The default is Sintel (Blender Foundation, CC BY 3.0) and its official English subtitles. Writes output/result.json
and output/answers.md.
"""
import json
import os
import re
from pathlib import Path

from boxline import Boxline

here = Path(__file__).resolve().parent
out = Path(os.environ.get("OUTPUT_DIR", "output"))
video = os.environ.get("VIDEO_URL", "")
subtitles = os.environ.get("SUBTITLES_URL") or ("" if video else "https://durian.blender.org/wp-content/content/subtitles/sintel_en.srt")
questions = [q.strip() for q in os.environ.get("QUESTIONS", "What is the girl looking for?|What does the old man warn her about?|How does it end for the dragon?").split("|") if q.strip()]
bx = Boxline()

OUTPUT = {
    "type": "object",
    "properties": {"answers": {"type": "array", "items": {"type": "object", "properties": {"question": {"type": "string"}, "answer": {"type": "string"}, "moments": {"type": "array", "items": {"type": "string", "description": "mm:ss"}}}, "required": ["question", "answer", "moments"]}}},
    "required": ["answers"],
}

# yt-dlp only when it is needed (a video address rather than a subtitles file).
with bx.sessions.create(browser=False, shell=True, setup=["pip install -q yt-dlp"] if video else [], timeout=900, idle_timeout=300, user_metadata={"example": "chat-with-a-video"}) as session:
    print(f"Session: {session.id}", flush=True)
    session.files.write("transcript.py", (here.parent / "transcript.py").read_bytes())
    t = session.exec("python transcript.py", env={"SUBTITLES_URL": subtitles, "VIDEO_URL": video}, timeout_ms=300_000)
    if t["exitCode"] != 0:
        raise SystemExit(f"transcript.py failed: {(t['stderr'] or t['stdout']).strip()}")
    print(t["stdout"].strip())
    transcript = session.files.read_text("transcript.txt")

    # The agent reads the transcript in the shell (grep, cat): answers come from what is said, with their moments.
    numbered = "\n".join(f"{i}. {q}" for i, q in enumerate(questions, 1))
    started = bx.agent.run(
        "/workspace/transcript.txt is a video's transcript: each line starts with its time [mm:ss]. Answer these questions from what is said in it "
        "only; when it does not say, answer so. For each answer give the moments (mm:ss, as written in the transcript) it rests on. Do not write files.\n\n" + numbered,
        session_id=session.id,
        max_steps=15,
        output=OUTPUT,
    )
    print(f"Agent run {started['id']} ({started['model']}) is reading the transcript…", flush=True)
    run = bx.agent.wait(started["id"])
    if run["status"] != "completed" or not run["result"]:
        raise SystemExit(f"the run {run['status']}: {run.get('error') or 'no answer'}")
    answers = run["result"]["answers"]

# Every moment must be a caption's time in the transcript.
times = set(re.findall(r"^\[(\d{2}:\d{2})\]", transcript, re.M))
unknown = [m.strip("[]") for a in answers for m in a["moments"] if m.strip("[]") not in times]
for a in answers:
    print(f"\nQ: {a['question']}\nA: {a['answer']}\n   at {', '.join(a['moments']) or '-'}")
print(f"\nMoments not in the transcript: {', '.join(unknown)}" if unknown else "\nEvery moment cited is a caption's time.")
md = [f"# {video or subtitles}", ""]
for a in answers:
    md += [f"## {a['question']}", "", a["answer"], "", f"At {', '.join(a['moments']) or 'no moment'}.", ""]
out.mkdir(parents=True, exist_ok=True)
(out / "answers.md").write_text("\n".join(md))
(out / "transcript.txt").write_text(transcript)
(out / "result.json").write_text(json.dumps({"video": video or None, "subtitles": subtitles or None, "captions": len(times), "answers": answers, "unknownMoments": unknown, "agentRuns": [{"id": run["id"]}]}, indent=2, ensure_ascii=False))
