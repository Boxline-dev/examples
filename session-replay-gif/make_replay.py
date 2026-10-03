"""Runs in the session's shell: frames/NNN.jpg and frames.json (each frame's time) to replay.mp4 and replay.gif with
ffmpeg. Each frame stays on screen as long as it did in the session, between MIN and MAX seconds (long idle stretches
are shortened). Prints a JSON summary measured with ffprobe."""
import json
import subprocess

MIN, MAX, LAST = 0.4, 2.0, 1.5
frames = json.load(open("frames.json"))
times = [f["t"] for f in frames]
durations = [min(MAX, max(MIN, b - a)) for a, b in zip(times, times[1:])] + [LAST]

with open("list.txt", "w") as f:
    for frame, d in zip(frames, durations):
        f.write(f"file '{frame['file']}'\nduration {d:.3f}\n")
    f.write(f"file '{frames[-1]['file']}'\n")  # the concat demuxer needs the last file twice for its duration to count


def run(*args):
    subprocess.run(args, check=True, capture_output=True)


run("ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", "list.txt",
    "-vf", "scale=1280:-2:flags=lanczos,fps=10,format=yuv420p", "-c:v", "libx264", "-movflags", "+faststart", "replay.mp4")
run("ffmpeg", "-y", "-loglevel", "error", "-i", "replay.mp4",
    "-vf", "fps=5,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse", "replay.gif")


def probe(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-count_frames",
                          "-show_entries", "stream=width,height,nb_read_frames:format=duration", "-of", "json", path],
                         check=True, capture_output=True, text=True).stdout
    p = json.loads(out)
    s = p["streams"][0]
    return {"seconds": round(float(p["format"]["duration"]), 2), "width": s["width"], "height": s["height"], "frames": int(s["nb_read_frames"])}


print(json.dumps({"screens": len(frames), "plannedSeconds": round(sum(durations), 2), "mp4": probe("replay.mp4"), "gif": probe("replay.gif")}))
