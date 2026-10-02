"""The webhook receiver of "Watch a price": it verifies each task_run.finished delivery against the raw body, drops
repeats (a delivery can arrive more than once), and compares the run's price with the last one it saw for that task
(kept in a JSON file). main.py starts it in a thread; to keep watching, run it on a public HTTPS address:

    WEBHOOK_SECRET=whsec_… PORT=8787 STATE_FILE=last-price.json python python/receiver.py
"""
import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from boxline import WebhookSignatureError, verify_webhook


class Receiver:
    def __init__(self, state_file: Path, port: int = 0, secret: str = "") -> None:
        self.state_file = Path(state_file)
        self.secret = secret
        self.deliveries: list = []
        self._seen: set = set()
        self._arrived = threading.Condition()
        receiver = self

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self) -> None:  # noqa: N802 (http.server's naming)
                body = self.rfile.read(int(self.headers.get("Content-Length") or 0))
                try:
                    event = verify_webhook(body, self.headers.get("Boxline-Signature"), receiver.secret)
                except WebhookSignatureError as e:
                    self.send_response(400)
                    self.end_headers()
                    self.wfile.write(e.reason.encode())
                    return
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b"ok")
                receiver._handle(event)

            def log_message(self, *args) -> None:  # quiet
                pass

        self._server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
        self.url = f"http://127.0.0.1:{self._server.server_address[1]}/boxline"
        threading.Thread(target=self._server.serve_forever, daemon=True).start()

    def _handle(self, event: dict) -> None:
        if event["type"] != "task_run.finished" or event["id"] in self._seen:
            return
        self._seen.add(event["id"])
        data = event["data"]
        state = json.loads(self.state_file.read_text()) if self.state_file.exists() else {}
        last = state.get(data["taskId"])
        result = data.get("result")
        if data["status"] != "completed" or not result:
            delivery = {"eventId": event["id"], "taskRunId": data["taskRunId"], "status": data["status"], "price": None,
                        "previous": last["price"] if last else None, "changed": None, "message": f"the run {data['status']}: nothing to compare"}
        else:
            changed = None if last is None else (last["price"] != result["price"] or last["inStock"] != result["inStock"])
            if changed is None:
                message = f"first price seen: {result['price']} {result['currency']}"
            elif changed:
                message = f"CHANGED: {last['price']} -> {result['price']} {result['currency']}"
            else:
                message = f"no change: still {result['price']} {result['currency']}"
            state[data["taskId"]] = {**result, "at": event["createdAt"]}
            self.state_file.write_text(json.dumps(state, indent=2))
            delivery = {"eventId": event["id"], "taskRunId": data["taskRunId"], "status": data["status"], "price": result["price"],
                        "previous": last["price"] if last else None, "changed": changed, "message": message}
        print(f"webhook {event['id']}: {delivery['message']}", flush=True)
        with self._arrived:
            self.deliveries.append(delivery)
            self._arrived.notify_all()

    def wait_for(self, task_run_id: str, timeout: float = 60) -> dict:
        """The delivery for this task run (already here, or the next one to arrive)."""
        with self._arrived:
            found = self._arrived.wait_for(lambda: next((d for d in self.deliveries if d["taskRunId"] == task_run_id), None), timeout)
        if not found:
            raise TimeoutError(f"no webhook for task run {task_run_id} within {timeout:g} s")
        return found

    def close(self) -> None:
        self._server.shutdown()


if __name__ == "__main__":
    if not os.environ.get("WEBHOOK_SECRET"):
        raise SystemExit("Set WEBHOOK_SECRET to the endpoint's secret (whsec_…)")
    r = Receiver(Path(os.environ.get("STATE_FILE", "last-price.json")), int(os.environ.get("PORT", "8787")), os.environ["WEBHOOK_SECRET"])
    print(f"Listening on {r.url} (put it behind HTTPS on a public address)")
    threading.Event().wait()
