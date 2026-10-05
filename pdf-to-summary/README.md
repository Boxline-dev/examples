# PDF to summary

Download a PDF in the shell, turn it into text with pdftotext, and have a model sum it up in 5 bullet points from the session's browser.

| | |
|---|---|
| Uses | `exec` (curl, pdftotext), `files.readText`, the `evaluate` and `extract` actions |
| Needs | a plan with shell sessions and a model on the API |
| Site | arXiv ("Attention Is All You Need", 1706.03762) |
| Output | `output/document.txt` and `output/summary.md` |

**Inputs** (environment variables):

- `PDF_URL`: the PDF (default `https://arxiv.org/pdf/1706.03762`).

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

`npx tsx check.ts output` reads what the example wrote and exits with 0 only when the result is right. The text is the paper, and the summary has 5 bullet points about the Transformer and attention.

