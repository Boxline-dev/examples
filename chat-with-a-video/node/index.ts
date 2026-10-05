/**
 * Chat with a video: ask questions about a video and get answers from what is said in it, each with the moments
 * (mm:ss) to jump to. The subtitles are fetched into a session's shell (a .srt or .vtt file, or with yt-dlp for videos
 * you may download), and an agent in that session answers from the transcript; every timestamp it cites is checked.
 *
 *   npx tsx node/index.ts            (BOXLINE_API_KEY; SUBTITLES_URL or VIDEO_URL; QUESTIONS separated by |)
 *
 * The default is Sintel (Blender Foundation, CC BY 3.0) and its official English subtitles. Writes output/result.json
 * and output/answers.md.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Boxline } from "@boxline/sdk";

const here = dirname(fileURLToPath(import.meta.url));
const out = process.env.OUTPUT_DIR ?? "output";
const video = process.env.VIDEO_URL ?? "";
const subtitles = process.env.SUBTITLES_URL ?? (video ? "" : "https://durian.blender.org/wp-content/content/subtitles/sintel_en.srt");
const questions = (process.env.QUESTIONS ?? "What is the girl looking for?|What does the old man warn her about?|How does it end for the dragon?").split("|").map((q) => q.trim()).filter(Boolean);
const bx = new Boxline();

type Answers = { answers: { question: string; answer: string; moments: string[] }[] };

// yt-dlp only when it is needed (a video address rather than a subtitles file).
const session = await bx.sessions.create({ browser: false, shell: true, setup: video ? ["pip install -q yt-dlp"] : [], timeout: 900, idleTimeout: 300, userMetadata: { example: "chat-with-a-video" } });
console.log(`Session: ${session.id}`);
let transcript = "";
let result!: Answers;
let runId = "";
try {
  await session.files.write("transcript.py", readFileSync(join(here, "../transcript.py")));
  const t = await session.exec("python transcript.py", { env: { SUBTITLES_URL: subtitles, VIDEO_URL: video }, timeoutMs: 300_000 });
  if (t.exitCode !== 0) throw new Error(`transcript.py failed: ${(t.stderr || t.stdout).trim()}`);
  console.log(t.stdout.trim());
  transcript = await session.files.readText("transcript.txt");

  // The agent reads the transcript in the shell (grep, cat): answers come from what is said, with their moments.
  const started = await bx.agent.run({
    sessionId: session.id,
    maxSteps: 15,
    task:
      `/workspace/transcript.txt is a video's transcript: each line starts with its time [mm:ss]. Answer these questions from what is said in it ` +
      `only; when it does not say, answer so. For each answer give the moments (mm:ss, as written in the transcript) it rests on. Do not write files.\n\n` +
      questions.map((q, i) => `${i + 1}. ${q}`).join("\n"),
    output: {
      type: "object",
      properties: { answers: { type: "array", items: { type: "object", properties: { question: { type: "string" }, answer: { type: "string" }, moments: { type: "array", items: { type: "string", description: "mm:ss" } } }, required: ["question", "answer", "moments"] } } },
      required: ["answers"],
    },
  });
  console.log(`Agent run ${started.id} (${started.model}) is reading the transcript…`);
  runId = started.id;
  const run = await bx.agent.wait<Answers>(started.id);
  if (run.status !== "completed" || !run.result) throw new Error(`the run ${run.status}: ${run.error ?? "no answer"}`);
  result = run.result;
} finally {
  await session.stop();
}

// Every moment must be a caption's time in the transcript.
const times = new Set([...transcript.matchAll(/^\[(\d{2}:\d{2})\]/gm)].map((m) => m[1]));
const unknown = result.answers.flatMap((a) => a.moments.map((m) => m.replace(/^\[|\]$/g, "")).filter((m) => !times.has(m)));
for (const a of result.answers) console.log(`\nQ: ${a.question}\nA: ${a.answer}\n   at ${a.moments.join(", ") || "-"}`);
console.log(unknown.length ? `\nMoments not in the transcript: ${unknown.join(", ")}` : "\nEvery moment cited is a caption's time.");
const md = [`# ${video || subtitles}`, "", ...result.answers.flatMap((a) => [`## ${a.question}`, "", a.answer, "", `At ${a.moments.join(", ") || "no moment"}.`, ""])].join("\n");
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "answers.md"), md);
writeFileSync(join(out, "transcript.txt"), transcript);
writeFileSync(join(out, "result.json"), JSON.stringify({ video: video || null, subtitles: subtitles || null, captions: times.size, answers: result.answers, unknownMoments: unknown, agentRuns: [{ id: runId }] }, null, 2));
