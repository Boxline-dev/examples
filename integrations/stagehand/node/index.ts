/**
 * Stagehand with Boxline: Stagehand's act() and extract() drive a Boxline session's browser, connected by its CDP
 * address (Stagehand v3: env "LOCAL" with localBrowserLaunchOptions.cdpUrl). Stagehand calls the model itself, with
 * your own OpenAI key.
 *
 *   npm install && npx tsx index.ts        (BOXLINE_API_KEY and OPENAI_API_KEY in the environment; STAGEHAND_MODEL)
 *
 * Stagehand v4 connects differently: it loads its own browser extension from this computer's disk and needs the
 * `debugger` permission, which Boxline sessions do not accept. Use v3 with Boxline. Writes output/result.json.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Boxline } from "@boxline/sdk";
import { Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod";

const out = process.env.OUTPUT_DIR ?? "output";
const modelName = process.env.STAGEHAND_MODEL ?? "openai/gpt-6-luna";
if (!process.env.OPENAI_API_KEY) throw new Error("Set OPENAI_API_KEY: Stagehand calls the model itself");
const bx = new Boxline();

// keepAlive: the session stays up while Stagehand connects, and until it is stopped below.
const session = await bx.sessions.create({ timeout: 600, keepAlive: true, userMetadata: { example: "integrations/stagehand" } });
console.log(`Session: ${session.id}`);
const stagehand = new Stagehand({
  env: "LOCAL",
  localBrowserLaunchOptions: { cdpUrl: session.connectUrl! }, // a signed address: treat it like a password
  model: { modelName, apiKey: process.env.OPENAI_API_KEY },
  verbose: 0,
  disablePino: true,
});
try {
  await stagehand.init();
  const page = stagehand.context.pages()[0]!;
  await page.goto("https://books.toscrape.com/");
  const act = await stagehand.act("click the Poetry category in the list of book categories");
  console.log(`act: ${act.message}`);
  const { books } = await stagehand.extract(
    "the title and price of the first 5 books listed on this page",
    z.object({ books: z.array(z.object({ title: z.string(), price: z.string().describe("as shown, e.g. £51.77") })) }),
  );
  const url = page.url();
  const metrics = await stagehand.metrics;
  console.log(`${url}: ${books.length} books, e.g. ${books[0]?.title} ${books[0]?.price}`);

  mkdirSync(out, { recursive: true });
  writeFileSync(
    join(out, "result.json"),
    JSON.stringify(
      { sessionId: session.id, model: modelName, act: { success: act.success, message: act.message }, url, books, usage: { ownModelTokens: metrics.totalPromptTokens + metrics.totalCompletionTokens } },
      null,
      2,
    ),
  );
} finally {
  await stagehand.close().catch(() => undefined);
  await session.stop();
}
