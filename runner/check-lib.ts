import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";

/**
 * Helpers for the examples' result checks. A check runs as `npx tsx check.ts <output dir>` after its example, reads
 * what the example wrote (and, under the runner, `site.json`: what the stand-in site received), and prints one line:
 * `PASS <evidence>` with exit code 0, or `FAIL <why>` with exit code 1. It proves the result, not just that the
 * example ran.
 */

export const outputDir = () => process.argv[2] ?? process.env.OUTPUT_DIR ?? "output";
export const file = (name: string) => join(outputDir(), name);

export function readJson<T = any>(name: string): T {
  const path = file(name);
  if (!existsSync(path)) throw new Error(`${name} is missing (did the example finish?)`);
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

/** The example's result.json. */
export const result = <T = any>() => readJson<T>("result.json");

/** What the stand-in site received during the run (written by the runner), or null when the example ran elsewhere. */
export function site<T = any>(): (T & { url: string; records: any; expected: any }) | null {
  return existsSync(file("site.json")) ? readJson("site.json") : null;
}

export function expect(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export const bytes = (name: string) => {
  const path = file(name);
  expect(existsSync(path), `${name} is missing`);
  return readFileSync(path);
};
export const size = (name: string) => (existsSync(file(name)) ? statSync(file(name)).size : 0);

export const isPng = (b: Buffer) => b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
export const isPdf = (b: Buffer) => b.subarray(0, 5).toString("latin1") === "%PDF-";
/** Pages in a PDF: page objects (`/Type /Page`, not `/Pages`). Good enough for the PDFs these examples make. */
export const pdfPages = (b: Buffer) => (b.toString("latin1").match(/\/Type\s*\/Page(?![a-z])/g) ?? []).length;

/** The files in a zip (name and unpacked bytes; folders left out), read from its central directory. */
export function unzip(b: Buffer): { name: string; data: Buffer }[] {
  const end = b.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  expect(end >= 0, "not a zip file (no end of central directory)");
  const count = b.readUInt16LE(end + 10);
  let at = b.readUInt32LE(end + 16);
  const files: { name: string; data: Buffer }[] = [];
  for (let i = 0; i < count; i++) {
    expect(b.readUInt32LE(at) === 0x02014b50, "damaged zip central directory");
    const method = b.readUInt16LE(at + 10);
    const packed = b.readUInt32LE(at + 20);
    const nameLen = b.readUInt16LE(at + 28);
    const extraLen = b.readUInt16LE(at + 30);
    const commentLen = b.readUInt16LE(at + 32);
    const local = b.readUInt32LE(at + 42);
    const name = b.subarray(at + 46, at + 46 + nameLen).toString("utf8");
    at += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith("/")) continue;
    const start = local + 30 + b.readUInt16LE(local + 26) + b.readUInt16LE(local + 28);
    const raw = b.subarray(start, start + packed);
    expect(method === 0 || method === 8, `${name}: unknown zip compression ${method}`);
    files.push({ name, data: method === 8 ? inflateRawSync(raw) : Buffer.from(raw) });
  }
  return files;
}

export const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");

/** An MP4's duration in seconds, from its movie header box (moov/mvhd). */
export function mp4Duration(b: Buffer): number {
  expect(b.subarray(4, 8).toString("latin1") === "ftyp", "not an MP4 file (no ftyp box)");
  const i = b.indexOf(Buffer.from("mvhd", "latin1"));
  expect(i > 0, "no movie header (mvhd) in the MP4");
  const version = b[i + 4];
  const timescale = version === 1 ? b.readUInt32BE(i + 24) : b.readUInt32BE(i + 16);
  const duration = version === 1 ? Number(b.readBigUInt64BE(i + 28)) : b.readUInt32BE(i + 20);
  return duration / timescale;
}

/** Runs the check: `PASS <evidence>` and exit 0, or `FAIL <reason>` and exit 1. */
export function check(fn: () => string | Promise<string>) {
  Promise.resolve()
    .then(fn)
    .then(
      (evidence) => {
        console.log(`PASS ${evidence}`);
        process.exit(0);
      },
      (err) => {
        console.log(`FAIL ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      },
    );
}
