"""Video clip: download a video you are allowed to download with yt-dlp in the session's shell, and cut its first 30
seconds with ffmpeg. The default is Big Buck Bunny (Blender Foundation, CC BY 3.0) from archive.org.

    python python/main.py            (BOXLINE_API_KEY; VIDEO_URL, CLIP_SECONDS; a plan with shell sessions)

Only for videos you own, have the rights to, or that have an open licence. If the site refuses the download, the
example stops: it never disguises the downloader. Writes output/clip.mp4 and output/result.json.
"""
import json
import os
from pathlib import Path

from boxline import Boxline

out = Path(os.environ.get("OUTPUT_DIR", "output"))
video = os.environ.get("VIDEO_URL", "https://archive.org/download/BigBuckBunny_328/BigBuckBunny_512kb.mp4")
seconds = int(os.environ.get("CLIP_SECONDS", "30"))
bx = Boxline()

with bx.sessions.create(browser=False, shell=True, timeout=900, user_metadata={"example": "video-clip"}) as session:
    print(f"Session: {session.id}", flush=True)

    def sh(command: str, timeout_ms: int = 300_000) -> str:
        r = session.exec(command, env={"VIDEO_URL": video}, timeout_ms=timeout_ms)
        if r["exitCode"] != 0:
            tail = " | ".join((r["stderr"] or r["stdout"]).strip().split("\n")[-3:])
            raise SystemExit(f"{command.split(' ')[0]} failed: {tail}")
        return r["stdout"].strip()

    sh("pip install --quiet --disable-pip-version-check yt-dlp")
    # Only the first part is fetched (yt-dlp hands the range to ffmpeg), not the whole film.
    sh(f'mkdir -p downloads output && yt-dlp --quiet --no-progress --no-playlist --download-sections "*0-{seconds + 5}" -o "downloads/video.%(ext)s" "$VIDEO_URL"', 600_000)
    source = sh("ls downloads/video.* | head -1")
    print(f"Downloaded {source}")
    sh(f'ffmpeg -loglevel error -y -i "{source}" -t {seconds} -c:v libx264 -preset veryfast -c:a aac -movflags +faststart output/clip.mp4', 600_000)
    duration = float(sh("ffprobe -v error -show_entries format=duration -of csv=p=0 output/clip.mp4"))

    clip = session.files.read("output/clip.mp4")
    out.mkdir(parents=True, exist_ok=True)
    (out / "clip.mp4").write_bytes(clip)
    print(f"output/clip.mp4: {duration:.1f} s, {len(clip) // 1024} KB")
    (out / "result.json").write_text(json.dumps({"video": video, "seconds": seconds, "source": source, "duration": duration, "bytes": len(clip)}, indent=2))
