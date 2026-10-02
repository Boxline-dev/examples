/**
 * OpenAI computer use with Boxline: your own loop with OpenAI's computer tool (Responses API, `{type: "computer"}`).
 * The model looks at screenshots and answers with `computer_call`s; each action goes to the session unchanged
 * (POST /v1/sessions/:id/computer), and the screen after it goes back to the model.
 *
 *   npm install && npx tsx index.ts        (BOXLINE_API_KEY and OPENAI_API_KEY in the environment; CUA_MODEL, TASK)
 *
 * The tool sees only the page (there is no address bar): the loop opens the start page first. When OpenAI asks for a
 * safety check, a person confirms in the terminal; the loop never acknowledges one by itself. Writes output/result.json.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { Boxline, type ComputerAction, type ComputerResult } from "@boxline/sdk";
import OpenAI from "openai";

const out = process.env.OUTPUT_DIR ?? "output";
const start = process.env.START_URL ?? "https://books.toscrape.com/";
const task = process.env.TASK ?? "Open the Poetry category and tell me the title and price of the cheapest book in it.";
const model = process.env.CUA_MODEL ?? "gpt-6-luna";
const MAX_WIDTH = 1024; // screenshots are this wide; the model's coordinates are read in these pixels
const openai = new OpenAI();
const bx = new Boxline();

const session = await bx.sessions.create({ timeout: 900, userMetadata: { example: "integrations/openai-computer-use" } });
console.log(`Session: ${session.id}`);
const actions: unknown[] = [];
let tokens = 0;
let answer = "";
try {
  await session.goto(start);
  const first = await session.computer({ type: "screenshot" }, { maxWidth: MAX_WIDTH });
  const image = (s: ComputerResult) => `data:${s.mimeType};base64,${s.screenshot}`;

  let input: OpenAI.Responses.ResponseInput = [
    { role: "user", content: [{ type: "input_text", text: `${task} (The browser shows ${start}.)` }, { type: "input_image", image_url: image(first), detail: "auto" }] },
  ];
  let previous: string | undefined;
  for (let turn = 0; turn < 30; turn++) {
    const res = await openai.responses.create({ model, tools: [{ type: "computer" }], input, max_output_tokens: 4000, ...(previous ? { previous_response_id: previous } : {}) });
    previous = res.id;
    tokens += (res.usage?.input_tokens ?? 0) + (res.usage?.output_tokens ?? 0);
    const calls = res.output.filter((o): o is OpenAI.Responses.ResponseComputerToolCall => o.type === "computer_call");
    if (!calls.length) {
      answer = res.output_text;
      break;
    }
    input = [];
    for (const call of calls) {
      const checks = call.pending_safety_checks ?? [];
      if (checks.length) {
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        const ok = await rl.question(`OpenAI asks a person to confirm: ${checks.map((c) => c.message ?? c.code).join("; ")}. Go on? (yes/no) `);
        rl.close();
        if (!/^y(es)?$/i.test(ok.trim())) throw new Error("stopped: the safety check was not confirmed");
      }
      // One computer_call can carry several actions; only the last needs a screenshot.
      const list = call.actions?.length ? call.actions : call.action ? [call.action] : [];
      let screen: ComputerResult | null = null;
      for (const [i, action] of list.entries()) {
        screen = await session.computer(action as unknown as ComputerAction, { maxWidth: MAX_WIDTH, screenshot: i === list.length - 1 });
        actions.push(action);
        console.log(`→ ${action.type}: ${screen.text}`);
      }
      if (!screen?.screenshot) screen = await session.computer({ type: "screenshot" }, { maxWidth: MAX_WIDTH });
      input.push({
        type: "computer_call_output",
        call_id: call.call_id,
        output: { type: "computer_screenshot", image_url: image(screen) },
        ...(checks.length ? { acknowledged_safety_checks: checks.map(({ id, code, message }) => ({ id, code, message })) } : {}),
      });
    }
  }
  console.log(`\n${answer}`);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "result.json"), JSON.stringify({ model, task, start, answer, actions, usage: { ownModelTokens: tokens } }, null, 2));
} finally {
  await session.release();
}
