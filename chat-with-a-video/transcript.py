"""Runs in the session's shell: gets a video's subtitles and writes /workspace/transcript.txt, one line per caption:
"[mm:ss] text". From SUBTITLES_URL (a SubRip .srt or WebVTT .vtt file), or from VIDEO_URL with yt-dlp (subtitles only,
nothing else is downloaded; for videos you may download)."""
import glob
import os
import re
import subprocess
import urllib.request

subs_url = os.environ.get("SUBTITLES_URL")
video_url = os.environ.get("VIDEO_URL")
if subs_url:
    with urllib.request.urlopen(urllib.request.Request(subs_url, headers={"user-agent": "chat-with-a-video (a Boxline example)"}), timeout=60) as r:
        raw = r.read().decode("utf-8-sig", "replace")
elif video_url:
    subprocess.run(["yt-dlp", "--quiet", "--skip-download", "--write-subs", "--write-auto-subs", "--sub-langs", "en.*,en", "--sub-format", "vtt/srt/best", "-o", "/workspace/video.%(ext)s", video_url], check=True)
    files = sorted(glob.glob("/workspace/video*.vtt") + glob.glob("/workspace/video*.srt"))
    if not files:
        raise SystemExit("this video has no English subtitles")
    raw = open(files[0], encoding="utf-8-sig").read()
else:
    raise SystemExit("set SUBTITLES_URL or VIDEO_URL")

lines, last = [], None
for block in re.split(r"\n\s*\n", raw.replace("\r", "")):
    m = re.search(r"(\d{1,2}):(\d{2}):(\d{2})[.,]\d{3}\s*-->", block)
    if not m:
        continue
    rows = block.split("\n")
    first = next(k for k, row in enumerate(rows) if "-->" in row) + 1  # the caption's text follows its time line
    text = re.sub(r"<[^>]+>", "", " ".join(row.strip() for row in rows[first:] if row.strip())).strip()  # WebVTT styling tags
    if not text or text == last:  # automatic captions repeat lines as they roll
        continue
    last = text
    minutes = int(m.group(1)) * 60 + int(m.group(2))
    lines.append(f"[{minutes:02d}:{m.group(3)}] {text}")
open("/workspace/transcript.txt", "w").write("\n".join(lines) + "\n")
print(f"{len(lines)} captions, {len(' '.join(lines).split())} words")
