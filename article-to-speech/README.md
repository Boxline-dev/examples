# Article to speech

Turn a web article into an MP3 you can listen to, with no speech API key: the article's own paragraphs are taken
from the page and spoken offline in a session's shell.

| | |
|---|---|
| Uses | `extract` (the article's paragraphs), `fetch` (the page's text, to check them), a shell session (espeak-ng through `setup`, ffmpeg) |
| Needs | shell sessions and a model on the API (no keys of your own) |
| Site | a Wikipedia article by default (CC BY-SA: credit it if you share the audio); the runner uses a stand-in article |
| Output | `output/article.mp3`, `output/article.txt` (what was read), `output/result.json` |

The model is asked for the article's paragraphs word for word (no menus, captions, footnotes or footers), and each
paragraph is checked against the page's own text: one the model rewrote is not read out. espeak-ng, installed by the
session's `setup`, speaks the text and ffmpeg encodes it. For more natural voices, swap espeak-ng for Piper
(`pip install piper-tts` and a voice model) in the same shell, or a speech API with your own key.

**Inputs** (environment variables): `ARTICLE_URL`, `MAX_WORDS` (default 250), `VOICE` (default `en-us`), `SPEED`
(words per minute, default 165).

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

`npx tsx check.ts output` reads what the example wrote and exits with 0 only when the result is right. article.mp3 is an
MP3 whose length fits the number of words and the speed. On the runner's stand-in article: its three paragraphs are
read word for word, and the menu and the footer are not.
