/**
 * GitHub profile summary: what a developer works with, measured, not guessed. Their public profile and repository
 * list are read in a sandboxed browser; their top repositories are cloned in the session's shell and measured there
 * (lines of code per language, frameworks from the manifests, CI and containers).
 *
 *   npx tsx node/index.ts            (BOXLINE_API_KEY; GITHUB_USER, TOP_REPOS; a plan with shell sessions)
 *
 * Public data only: the profile page, and repositories anyone can clone. Writes output/result.json and output/summary.md.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Boxline } from "@boxline/sdk";

const here = dirname(fileURLToPath(import.meta.url));
const out = process.env.OUTPUT_DIR ?? "output";
const user = process.env.GITHUB_USER ?? "octocat";
const base = (process.env.GITHUB_URL ?? "https://github.com").replace(/\/$/, "");
const topN = Number(process.env.TOP_REPOS ?? 3);
const bx = new Boxline();

type Repo = { name: string; url: string; description: string | null; language: string | null; stars: number; fork: boolean };
type Profile = { name: string | null; bio: string | null; location: string | null; followers: number | null; repos: Repo[] };
type Measured = { url: string; name: string; error?: string; linesByLanguage?: Record<string, number>; frameworks?: string[]; tools?: string[]; manifests?: string[] };

// 1. The profile and its repositories, sorted by stars (two pages read in one call).
const r = await bx.extract<Profile>({
  urls: [`${base}/${user}`, `${base}/${user}?tab=repositories&type=source&sort=stargazers`],
  prompt: `The GitHub user ${user}: their name, bio, location and followers from the profile, and the repositories listed (name, full https URL, description, main language, stars, whether it is a fork).`,
  schema: {
    type: "object",
    properties: {
      name: { type: ["string", "null"] },
      bio: { type: ["string", "null"] },
      location: { type: ["string", "null"] },
      followers: { type: ["integer", "null"] },
      repos: {
        type: "array",
        items: {
          type: "object",
          properties: { name: { type: "string" }, url: { type: "string" }, description: { type: ["string", "null"] }, language: { type: ["string", "null"] }, stars: { type: "integer" }, fork: { type: "boolean" } },
          required: ["name", "url", "description", "language", "stars", "fork"],
        },
      },
    },
    required: ["name", "bio", "location", "followers", "repos"],
  },
});
const profile = r.data;
// Their own work: forks left out, most stars first; only addresses of this user's repositories are cloned.
const own = profile.repos.filter((x) => !x.fork && x.url.startsWith(`${base}/${user}/`)).sort((a, b) => b.stars - a.stars);
const top = own.slice(0, topN);
console.log(`${profile.name ?? user}: ${profile.repos.length} repositories listed, ${own.length} of their own; measuring ${top.map((x) => x.name).join(", ")}`);
if (!top.length) throw new Error(`no public repositories of ${user} to measure`);

// 2. Clone and measure them on the machine (nothing runs on this computer).
const session = await bx.sessions.create({ browser: false, shell: true, timeout: 600, idleTimeout: 300, userMetadata: { example: "github-profile-summary" } });
console.log(`Session: ${session.id}`);
let stack: { repos: Measured[]; linesByLanguage: Record<string, number> };
try {
  await session.files.write("stack.py", readFileSync(join(here, "../stack.py")));
  const run = await session.exec("python stack.py", { env: { REPOS: top.map((x) => x.url).join(",") }, timeoutMs: 600_000 });
  if (run.exitCode !== 0) throw new Error(`stack.py failed: ${run.stderr.trim()}`);
  console.log(run.stdout.trim());
  stack = JSON.parse(await session.files.readText("stack.json"));
} finally {
  await session.stop();
}

const total = Object.values(stack.linesByLanguage).reduce((a, b) => a + b, 0);
const languages = Object.entries(stack.linesByLanguage).map(([language, lines]) => ({ language, lines, share: total ? Math.round((lines / total) * 1000) / 10 : 0 }));
const frameworks = [...new Set(stack.repos.flatMap((x) => x.frameworks ?? []))].sort();
const tools = [...new Set(stack.repos.flatMap((x) => x.tools ?? []))].sort();
const repos = top.map((t) => ({ ...t, measured: stack.repos.find((m) => m.url === t.url) ?? null }));

const md = [
  `# ${profile.name ?? user} (${user})`,
  "",
  [profile.bio, profile.location, profile.followers !== null ? `${profile.followers} followers` : null].filter(Boolean).join(" · "),
  "",
  `## Languages (lines of code in ${repos.length} top repositories)`,
  "",
  ...(languages.length ? languages.map((l) => `- ${l.language}: ${l.lines} lines (${l.share}%)`) : ["- no code files"]),
  "",
  `**Frameworks and libraries:** ${frameworks.join(", ") || "none found in manifests"}`,
  "",
  `**Tools:** ${tools.join(", ") || "none found"}`,
  "",
  "## Repositories",
  "",
  ...repos.map((x) => `- [${x.name}](${x.url}) (${x.stars} stars): ${x.description ?? "no description"}${x.measured?.error ? ` (could not be cloned)` : ""}`),
  "",
].join("\n");
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "summary.md"), md);
writeFileSync(join(out, "result.json"), JSON.stringify({ user, profile: { ...profile, repos: undefined }, listed: profile.repos.length, languages, frameworks, tools, repos, usage: { modelUsd: r.usage.costUsd } }, null, 2));
console.log(`\n${md}`);
