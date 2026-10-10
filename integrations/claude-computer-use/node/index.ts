/**
 * Claude computer use with Boxline: your own loop with Claude's computer toolset (Messages API). Claude looks at
 * screenshots and answers with one `tool_use` block per action, named after the action (`left_click`, `type`, …); each
 * goes to the session as `{action: <name>, ...input}` (POST /v1/sessions/:id/browser/computer), and the result goes
 * back to Claude with `toolset_name: "computer"`.
 *
 *   npm install && npx tsx index.ts        (BOXLINE_API_KEY and ANTHROPIC_API_KEY in the environment; CUA_MODEL, TASK)
 *
 * The toolset sees only the page (there is no address bar): the loop opens the start page first. Writes output/result.json.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { Boxline, type ComputerAction } from "@boxline/sdk";

const out = process.env.OUTPUT_DIR ?? "output";
const start = process.env.START_URL ?? "https://books.toscrape.com/";
const task = process.env.TASK ?? "Open the Poetry category and tell me the title and price of the cheapest book in it.";
const model = process.env.CUA_MODEL ?? "claude-sonnet-5-5"; // any Claude 5.5 model: they take computer_toolset_20260801
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
  // No screen size: Claude's coordinates are in the pixels of the screenshots it gets (all MAX_WIDTH wide).
  const tools: Anthropic.ToolUnion[] = [{ type: "computer_toolset_20260801" }];
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: `${task} (The browser shows ${start}.)` }];

  for (let turn = 0; turn < 30; turn++) {
    // Streamed: a large max_tokens needs it. The conversation is only ever appended to (Claude's thinking is bound to it).
    const res = await anthropic.messages.stream({ model, max_tokens: 64000, tools, messages }).finalMessage();
    tokens += res.usage.input_tokens + res.usage.output_tokens;
    messages.push({ role: "assistant", content: res.content });
    const uses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (!uses.length) {
      answer = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n");
      break;
    }
    // A turn's actions run in order; after a failed one the rest are not run.
    const results: Anthropic.ToolResultBlockParam[] = [];
    let failed = false;
    for (const [i, use] of uses.entries()) {
      if (failed) {
        results.push({ type: "tool_result", tool_use_id: use.id, toolset_name: "computer", is_error: true, content: "Not executed: an earlier computer action in this turn failed." });
        continue;
      }
      const input = { ...(use.input as object), action: use.name } as ComputerAction;
      const after = await session.computer(input, { maxWidth: MAX_WIDTH });
      actions.push(input);
      console.log(`→ ${use.name}: ${after.text}`);
      failed = !after.ok;
      // The screen goes back with screenshot and zoom, a failed action and the turn's last action; others say what they did.
      const showScreen = use.name === "screenshot" || use.name === "zoom" || failed || i === uses.length - 1;
      results.push({
        type: "tool_result",
        tool_use_id: use.id,
        toolset_name: "computer",
        is_error: failed,
        content: [
          { type: "text", text: after.ok ? after.text || "Done." : (after.error ?? "the action failed") },
          ...(showScreen && after.screenshot ? [{ type: "image" as const, source: { type: "base64" as const, media_type: after.mimeType as "image/png" | "image/jpeg", data: after.screenshot } }] : []),
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
