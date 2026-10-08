import { bytes, check, expect, result, untarGz } from "../runner/check-lib.js";

check(() => {
  const r = result();
  // A shell-only session: no live view, no CDP address, and a browser call was refused with BrowserDisabledError.
  expect(r.shellOnly.browser === false && r.shellOnly.shell === true, `the session was ${JSON.stringify(r.shellOnly)}, not shell-only`);
  expect(r.shellOnly.liveUrl === null && r.shellOnly.connectUrl === null, "a shell-only session has no liveUrl and no connectUrl");
  expect(r.shellOnly.browserCall.error === "BrowserDisabledError" && r.shellOnly.browserCall.status === 409, `the browser call: ${JSON.stringify(r.shellOnly.browserCall)}`);
  // The files were read while the session was stopped, and reading did not start it.
  expect(r.stoppedStatus === "STOPPED", `the session was ${r.stoppedStatus} when its files were read`);
  expect(r.statusAfterReads === "STOPPED", `after the reads the session was ${r.statusAfterReads}: reading must not resume it`);
  const listed = r.listing.map((e: any) => e.name).sort();
  expect(JSON.stringify(listed) === JSON.stringify(["data.csv", "logs", "squares.json", "summary.txt"]), `results/ lists ${listed.join(", ")}`);
  expect(r.read["results/summary.txt"] === "Results of the example results-after-stop\n", "summary.txt reads differently from what was written");
  expect(JSON.stringify(JSON.parse(r.read["results/squares.json"])) === JSON.stringify(Array.from({ length: 10 }, (_, k) => (k + 1) ** 2)), "squares.json is not the squares of 1 to 10");

  // The archive: a real .tar.gz, with the folder's files and nothing from outside it.
  const buf = bytes("results.tar.gz");
  expect(buf[0] === 0x1f && buf[1] === 0x8b, "results.tar.gz is not gzip");
  expect(buf.length === r.archive.bytes, "the saved archive is not the one downloaded");
  const inside = (name: string) => name.replace(/^results\//, "");
  const entries = untarGz(buf).filter((e) => e.type === "0" && inside(e.name) !== "");
  const names = entries.map((e) => inside(e.name)).sort();
  expect(JSON.stringify(names) === JSON.stringify(["data.csv", "logs/run.log", "squares.json", "summary.txt"]), `the archive holds ${names.join(", ")}`);
  const text = (name: string) => entries.find((e) => inside(e.name) === name)!.data.toString("utf8");
  expect(text("summary.txt") === r.read["results/summary.txt"], "summary.txt in the archive differs from the one read");
  expect(text("data.csv") === ["n,square", ...Array.from({ length: 10 }, (_, k) => `${k + 1},${(k + 1) ** 2}`)].join("\n") + "\n", "data.csv in the archive is wrong");
  expect(JSON.stringify(JSON.parse(text("squares.json"))) === JSON.stringify(JSON.parse(r.read["results/squares.json"])), "squares.json in the archive differs from the one read");
  expect(text("logs/run.log") === "line 1\nline 2\nline 3\n", `logs/run.log in the archive: ${JSON.stringify(text("logs/run.log"))}`);
  expect(!untarGz(buf).some((e) => /notes\.txt|\.boxline/.test(e.name)), "the archive holds a file from outside the folder");
  return `session stopped; ${listed.length} entries listed, summary.txt and squares.json read and results.tar.gz (${buf.length} bytes: ${names.join(", ")}) downloaded without resuming it (still ${r.statusAfterReads}); shell-only: liveUrl null, browser call ${r.shellOnly.browserCall.error}`;
});
