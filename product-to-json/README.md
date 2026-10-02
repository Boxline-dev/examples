# Product page to JSON

Pull a product's name, price, stock and specs from its page into a fixed shape given as a JSON Schema.

| | |
|---|---|
| Uses | `extract` with a schema |
| Needs | a model on the API (extract uses a fast, low-cost model by default) |
| Site | a books.toscrape.com product page (a demo shop) |
| Output | `output/product.json` |

**Inputs** (environment variables):

- `PRODUCT_URL`: your product page (default `https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html`).

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

`npx tsx check.ts output` reads what the example wrote and exits with 0 only when the result is right. Product.json matches the schema; for the default page: "A Light in the Attic", 51.77 GBP, in stock (22), UPC a897fe39b1053632.

