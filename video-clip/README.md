# Video clip

Download a video you are allowed to download with yt-dlp in the session's shell, and cut its first 30 seconds with ffmpeg. Only the first part is fetched. If the site refuses the download, the example stops: it never disguises the downloader.

| | |
|---|---|
| Uses | a shell-only session, `exec` (pip, yt-dlp, ffmpeg, ffprobe), `files.read` |
| Needs | a plan with shell sessions; no model |
| Site | archive.org: Big Buck Bunny (Blender Foundation, CC BY 3.0). Only videos you own, have the rights to, or that have an open licence |
| Output | `output/clip.mp4` and `output/result.json` |

**Inputs** (environment variables):

- `VIDEO_URL`: the video (default `https://archive.org/download/BigBuckBunny_328/BigBuckBunny_512kb.mp4`).
- `CLIP_SECONDS`: the clip's length (default `30`).

## Run it

Put your API key in the environment (`export BOXLINE_API_KEY=bxl_…`, or copy `.env.example` to `.env` and run
`set -a; . ./.env; set +a`). `BOXLINE_API_URL` points the SDK at another API (default `https://api.boxline.dev`).

Node 18 or newer:

```bash
npm install @boxline/sdk tsx
npx tsx node/index.ts
```

Python 3.9 or newer:

```bash
pip install boxline-sdk
python python/main.py
```

Both write to `output/` (`OUTPUT_DIR` picks another folder) and release their sessions when they finish.

## The result check

`npx tsx check.ts output` reads what the example wrote and exits with 0 only when the result is right. Clip.mp4 lasts about 30 s by its own MP4 header, and ffprobe in the session agrees.

