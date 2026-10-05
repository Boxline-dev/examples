/**
 * Claude computer use with Boxline: your own loop with Claude's computer tool (Messages API, beta). Claude looks at
 * screenshots and answers with `tool_use` blocks; each block's input goes to the session unchanged
 * (POST /v1/sessions/:id/computer), and the screen after it goes back to Claude as the tool result.
 *
 *   npm install && npx tsx index.ts        (BOXLINE_API_KEY and ANTHROPIC_API_KEY in the environment; CUA_MODEL, TASK)
 *
 * The tool sees only the page (there is no address bar): the loop opens the start page first. Writes output/result.json.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { Boxline, type ComputerAction } from "@boxline/sdk";

const out = process.env.OUTPUT_DIR ?? "output";
const start = process.env.START_URL ?? "https://books.toscrape.com/";
const task = process.env.TASK ?? "Open the Poetry category and tell me the title and price of the cheapest book in it.";
const model = process.env.CUA_MODEL ?? "claude-sonnet-5"; // computer_20251124; claude-haiku-4-5 uses computer_20250124
const MAX_WIDTH = 1024; // screenshots are this wide; Claude's coordinates are read in these pixels
const anthropic = new Anthropic();
const bx = new Boxline();

const session = await bx.sessions.create({ timeout: 900, userMetadata: { example: "integrations/claude-computer-use" } });
console.log(`Session: ${session.id}`);
const actions: unknown[] = [];
let tokens = 0;
let answer = "";
try {
  await session.goto(start);
  // The display size Claude is told is the size of the screenshots it gets.
  const screen = await session.computer({ action: "screenshot" }, { maxWidth: MAX_WIDTH });
  if (!screen.width || !screen.height) throw new Error("the session returned no screenshot size");
  const tool: Anthropic.Beta.BetaToolComputerUse20251124 = { type: "computer_20251124", name: "computer", display_width_px: screen.width, display_height_px: screen.height };
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: `${task} (The browser shows ${start}.)` }];

  for (let turn = 0; turn < 30; turn++) {
    const res = await anthropic.beta.messages.create({ model, max_tokens: 4096, tools: [tool], messages, betas: ["computer-use-2025-11-24"] });
    tokens += res.usage.input_tokens + res.usage.output_tokens;
    messages.push({ role: "assistant", content: res.content });
    const uses = res.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (!uses.length) {
      answer = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n");
      break;
    }
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const use of uses) {
      const input = use.input as ComputerAction;
      const after = await session.computer(input, { maxWidth: MAX_WIDTH });
      actions.push(input);
      console.log(`→ ${(input as { action?: string }).action}: ${after.text}`);
      results.push({
        type: "tool_result",
        tool_use_id: use.id,
        is_error: !after.ok,
        content: [
          ...(after.ok ? [] : [{ type: "text" as const, text: after.error ?? "the action failed" }]),
          ...(after.screenshot ? [{ type: "image" as const, source: { type: "base64" as const, media_type: after.mimeType as "image/png" | "image/jpeg", data: after.screenshot } }] : []),
        ],
      });
    }
    messages.push({ role: "user", content: results });
  }
  console.log(`\n${answer}`);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "result.json"), JSON.stringify({ model, task, start, answer, actions, usage: { ownModelTokens: tokens } }, null, 2));
} finally {
  await session.stop();
}
