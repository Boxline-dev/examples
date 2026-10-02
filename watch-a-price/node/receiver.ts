/**
 * The webhook receiver of "Watch a price": it verifies each task_run.finished delivery against the raw body, drops
 * repeats (a delivery can arrive more than once), and compares the run's price with the last one it saw for that task
 * (kept in a JSON file). index.ts starts it in the same process; to keep watching, run it on a public HTTPS address:
 *
 *   WEBHOOK_SECRET=whsec_… PORT=8787 STATE_FILE=last-price.json npx tsx node/receiver.ts
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { pathToFileURL } from "node:url";
import { verifyWebhook, WebhookSignatureError } from "@boxline/sdk";

export interface Price {
  title: string;
  price: number;
  currency: string;
  inStock: boolean;
}

export interface Delivery {
  eventId: string;
  taskRunId: string;
  status: string;
  price: number | null;
  previous: number | null;
  changed: boolean | null;
  message: string;
}

export async function startReceiver(opts: { port?: number; stateFile: string; secret?: string }) {
  let secret = opts.secret ?? "";
  const seen = new Set<string>();
  const deliveries: Delivery[] = [];
  const waiting = new Map<string, (d: Delivery) => void>();

  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      let event;
      try {
        event = verifyWebhook<{ taskId: string; taskRunId: string; status: string; result: Price | null }>(Buffer.concat(chunks), req.headers["boxline-signature"] as string, secret);
      } catch (err) {
        res.writeHead(400).end(err instanceof WebhookSignatureError ? err.reason : "bad request");
        return;
      }
      res.writeHead(200).end("ok");
      if (event.type !== "task_run.finished" || seen.has(event.id)) return;
      seen.add(event.id);

      const { taskId, taskRunId, status, result } = event.data;
      const state: Record<string, Price & { at: string }> = existsSync(opts.stateFile) ? JSON.parse(readFileSync(opts.stateFile, "utf8")) : {};
      const last = state[taskId];
      let delivery: Delivery;
      if (status !== "completed" || !result) {
        delivery = { eventId: event.id, taskRunId, status, price: null, previous: last?.price ?? null, changed: null, message: `the run ${status}: nothing to compare` };
      } else {
        const changed = last ? last.price !== result.price || last.inStock !== result.inStock : null;
        const message =
          changed === null
            ? `first price seen: ${result.price} ${result.currency}`
            : changed
              ? `CHANGED: ${last!.price} → ${result.price} ${result.currency}${last!.inStock !== result.inStock ? `, now ${result.inStock ? "in stock" : "out of stock"}` : ""}`
              : `no change: still ${result.price} ${result.currency}`;
        state[taskId] = { ...result, at: event.createdAt };
        writeFileSync(opts.stateFile, JSON.stringify(state, null, 2));
        delivery = { eventId: event.id, taskRunId, status, price: result.price, previous: last?.price ?? null, changed, message };
      }
      deliveries.push(delivery);
      console.log(`webhook ${event.id}: ${delivery.message}`);
      waiting.get(taskRunId)?.(delivery);
    });
  });
  await new Promise<void>((ok) => server.listen(opts.port ?? 0, "127.0.0.1", ok));
  const port = (server.address() as AddressInfo).port;

  return {
    url: `http://127.0.0.1:${port}/boxline`,
    deliveries,
    setSecret: (s: string) => (secret = s),
    /** The delivery for this task run (already here, or the next one to arrive). */
    waitFor: (taskRunId: string, timeoutMs = 60_000) =>
      new Promise<Delivery>((ok, fail) => {
        const done = deliveries.find((d) => d.taskRunId === taskRunId);
        if (done) return ok(done);
        const timer = setTimeout(() => fail(new Error(`no webhook for task run ${taskRunId} within ${timeoutMs / 1000} s`)), timeoutMs);
        waiting.set(taskRunId, (d) => (clearTimeout(timer), ok(d)));
      }),
    close: () => new Promise<void>((ok) => server.close(() => ok())),
  };
}

// Run on its own: a long-running receiver.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.env.WEBHOOK_SECRET) throw new Error("Set WEBHOOK_SECRET to the endpoint's secret (whsec_…)");
  const r = await startReceiver({ port: Number(process.env.PORT ?? 8787), stateFile: process.env.STATE_FILE ?? "last-price.json", secret: process.env.WEBHOOK_SECRET });
  console.log(`Listening on ${r.url} (put it behind HTTPS on a public address)`);
}
