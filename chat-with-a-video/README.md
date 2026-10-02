# Chat with a video

Ask questions about a video and get answers from what is said in it, each with the moments (mm:ss) to jump to.

| | |
|---|---|
| Uses | a shell session (`transcript.py`; yt-dlp through `setup` when given a video address), an agent run in that session |
| Needs | shell sessions and a model on the API (no model key of your own) |
| Site | Sintel (Blender Foundation, CC BY 3.0) and its official subtitles by default; the runner uses a stand-in talk |
| Output | `output/answers.md`, `output/transcript.txt`, `output/result.json` |

`transcript.py` gets the subtitles into the machine (a SubRip or WebVTT file from `SUBTITLES_URL`, or, with
`VIDEO_URL`, the video's subtitles through yt-dlp, which downloads nothing else) and writes one `[mm:ss] text` line per
caption. An agent in the same session reads that transcript in the shell and answers; every moment it cites is checked
against the captions' times. Use videos you may download (yours, openly licensed ones); some sites' terms forbid
downloading even subtitles. For a video without subtitles, transcribe it first (e.g. Whisper in the shell).

**Inputs** (environment variables): `SUBTITLES_URL` or `VIDEO_URL`, `QUESTIONS` (separated by `|`).

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

`npx tsx check.ts output` reads what the example wrote and exits with 0 only when the result is right. There is a
transcript and an answer to each question, and every moment cited is a caption's time. On the runner's stand-in talk:
about 50,000 bees at 00:12, the harvest in late August at 00:31, and a wind break at 00:20.
