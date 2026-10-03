"""Session replay as a GIF: a short browse in one session, then that session's own recording (one JPEG frame per screen
change) turned into an MP4 and a GIF with ffmpeg in a second, shell-only session. The frames keep the timing they
had (long idle stretches shortened), so the clip plays back what happened.

    python python/main.py            (BOXLINE_API_KEY; START_URL; a plan with shell sessions)

Writes output/replay.mp4, output/replay.gif, output/frames/ and output/result.json.
"""
import json
import os
from datetime import datetime
from pathlib import Path

from boxline import Boxline

here = Path(__file__).resolve().parent
out = Path(os.environ.get("OUTPUT_DIR", "output"))
start = os.environ.get("START_URL", "https://books.toscrape.com/")
bx = Boxline()

# 1. The browse to record: the shop, a category, a book, and back.
with bx.sessions.create(timeout=300, user_metadata={"example": "session-replay-gif"}) as browse:  # released at the end: a last frame
    print(f"Session: {browse.id} (the browse)", flush=True)
    browse.goto(start)
    browse.click(selector='a[href*="category/books/travel_2"]')
    browse.click(selector="article.product_pod h3 a")
    browse.back()

# 2. Its recording: the frames and when each was taken.
rec = bx.sessions.recording(browse.id)
if len(rec["frames"]) < 2:
    raise SystemExit(f"the recording has {len(rec['frames'])} frames")
(out / "frames").mkdir(parents=True, exist_ok=True)


def seconds(iso: str) -> float:
    return datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp()


t0 = seconds(rec["frames"][0]["at"])
frames = []
for i, f in enumerate(rec["frames"]):
    name = f"frames/{i:03d}.jpg"
    (out / name).write_bytes(bx.sessions.recording_frame(browse.id, f["index"]))
    frames.append({"file": name, "t": seconds(f["at"]) - t0, "url": f.get("url")})
pages = list(dict.fromkeys(f["url"] for f in frames if f["url"]))
print(f"{len(frames)} frames over {frames[-1]['t']:.1f} s: {' → '.join(pages)}", flush=True)

# 3. The clip, made in a shell-only session with ffmpeg; the files go in and come back through the files API.
with bx.sessions.create(browser=False, shell=True, timeout=600, user_metadata={"example": "session-replay-gif"}) as shell:
    print(f"Session: {shell.id} (ffmpeg)", flush=True)
    for f in frames:
        shell.files.write(f["file"], (out / f["file"]).read_bytes())
    shell.files.write("frames.json", json.dumps(frames))
    shell.files.write("make_replay.py", (here.parent / "make_replay.py").read_bytes())
    r = shell.exec("python3 make_replay.py", timeout_ms=300_000)
    if r["exitCode"] != 0:
        raise SystemExit(f"make_replay.py failed: {r['stderr'].strip()}")
    made = json.loads(r["stdout"])
    (out / "replay.mp4").write_bytes(shell.files.read("replay.mp4"))
    (out / "replay.gif").write_bytes(shell.files.read("replay.gif"))

print(f"replay.mp4: {made['mp4']['seconds']} s, {made['mp4']['width']}×{made['mp4']['height']}; replay.gif: {made['gif']['frames']} frames")
result = {"start": start, "sessionId": browse.id, "recordingMs": rec["durationMs"], **made, "frames": frames}
(out / "result.json").write_text(json.dumps(result, indent=2, ensure_ascii=False))
