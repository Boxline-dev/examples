# Session replay as a GIF

**Give your AI agents the infrastructure they need: browsers, shells, storage and isolated machines.**

Every session keeps a recording: one frame each time the screen changes, with the time and the page. This example
browses a shop for a few seconds, then turns that session's recording into an MP4 and a GIF with ffmpeg in a second,
shell-only session. Use it to show what an agent did in a pull request, a bug report or a demo.

| | |
|---|---|
| Uses | `sessions.create`, `session.click`, `session.back`, `sessions.recording`, `sessions.recordingFrame`, a `browser: false` shell session, `session.files`, `session.exec` (`make_replay.py`: ffmpeg, ffprobe) |
| Needs | a plan with shell sessions |
| Site | [Books to Scrape](https://books.toscrape.com/), a demo shop made for scraping practice (`START_URL` for another copy of it) |
| Output | `output/replay.mp4`, `output/replay.gif`, the frames in `output/frames/` and `output/result.json` |

**Inputs** (environment variables):

- `START_URL`: the shop's start page (default: Books to Scrape). The browse opens its Travel category, the first book
  there, and goes back.

How the clip is timed: each frame stays on screen until the next one was taken, at least 0.4 s so a quick change can
be seen, at most 2 s so a long wait does not drag; the last frame stays 1.5 s. The MP4 is 1280 pixels wide (H.264, it
plays everywhere); the GIF is 800 pixels wide at 5 frames a second with a palette made for the clip.

The recording works for any session, including an agent run: pass its session id to `sessions.recording` and the same
`make_replay.py` makes its clip.

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

Both write to `output/` (`OUTPUT_DIR` picks another folder) and stop their sessions when they finish.

## The result check

`npx tsx check.ts output` exits with 0 only when the recording has at least three screens in time order, including
the Travel category and a book's page, `replay.mp4` is an MP4 whose length (read from its header) matches the frames'
timing within half a second, and `replay.gif` is a GIF with a frame for every screen.

