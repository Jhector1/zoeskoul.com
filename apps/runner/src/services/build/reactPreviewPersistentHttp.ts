import type { Duplex } from "node:stream";
import { docker } from "../docker/dockerClient.js";

/** A single attached, non-TTY Docker exec per isolated Vite container.
 * The runner still authorizes every request before it enters this transport.
 * No container TCP port, host networking, Docker socket, or source mount is exposed.
 */
export type PreviewHttpResponse = Readonly<{
  status: number;
  headers: Readonly<Record<string, string>>;
  bodyBase64: string;
}>;

// Each request is an independent localhost fetch; threaded I/O prevents a slow
// asset from blocking every other asset in the same preview. No shell involved.
export const PERSISTENT_PREVIEW_HTTP_WORKER = String.raw`
import base64, concurrent.futures, json, sys, threading, urllib.error, urllib.request

LIMIT = 6 * 1024 * 1024
write_lock = threading.Lock()
executor = concurrent.futures.ThreadPoolExecutor(max_workers=8)

class NoExternalRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not newurl.startswith("http://127.0.0.1:5173/"):
            raise RuntimeError("Unsafe preview redirect")
        return super().redirect_request(req, fp, code, msg, headers, newurl)

opener = urllib.request.build_opener(NoExternalRedirects)

def respond(request):
    ident = request.get("id")
    path = request.get("path")
    method = request.get("method")
    try:
        if not isinstance(ident, int) or not isinstance(path, str) or not path.startswith("/") or path.startswith("//") or len(path) > 4096 or method not in ("GET", "HEAD"):
            raise RuntimeError("Invalid preview transport request")
        if any(ord(c) < 32 for c in path) or "\\" in path:
            raise RuntimeError("Invalid preview transport path")
        url = "http://127.0.0.1:5173" + path
        request_obj = urllib.request.Request(url, method=method)
        try:
            response = opener.open(request_obj, timeout=20)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            body = response.read(LIMIT + 1) if method == "GET" else b""
            if len(body) > LIMIT:
                raise RuntimeError("Preview response too large")
            headers = {}
            for name in ("Content-Type", "Cache-Control", "ETag", "Location"):
                value = response.headers.get(name)
                if value:
                    headers[name.lower()] = value
            result = {"id": ident, "status": int(response.status), "headers": headers,
                      "bodyBase64": base64.b64encode(body).decode("ascii")}
    except urllib.error.URLError as exc:
        reason = getattr(exc, "reason", None)
        result = {"id": ident, "error": "Connection refused" if isinstance(reason, ConnectionRefusedError) else "Preview transport request failed"}
    except Exception:
        result = {"id": ident, "error": "Preview transport request failed"}
    with write_lock:
        sys.stdout.write(json.dumps(result, separators=(",", ":")) + "\n")
        sys.stdout.flush()

for line in sys.stdin:
    if len(line) > 8192:
        continue
    try:
        item = json.loads(line)
        if isinstance(item, dict):
            executor.submit(respond, item)
    except Exception:
        continue
executor.shutdown(wait=False, cancel_futures=True)
`;

// One slow Vite transform must not invalidate concurrent, healthy assets.
// The Python worker processes at most 8 requests concurrently; up to 16
// requests can be queued. Bound both worker I/O (20s each) and the second
// batch's total wait, without coupling independent request lifetimes.
export const PREVIEW_HTTP_REQUEST_DEADLINE_MS = 46_000;
const MAX_DOCKER_FRAME = 9 * 1024 * 1024;
const MAX_LINE = 9 * 1024 * 1024;
const MAX_IN_FLIGHT = 16;

type Pending = {
  resolve: (result: PreviewHttpResponse) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

export class ReactPreviewPersistentHttpChannel {
  private raw = Buffer.alloc(0);
  private text = Buffer.alloc(0);
  private pending = new Map<number, Pending>();
  private nextId = 0;
  private closed = false;
  private consecutiveDeadlines = 0;

  constructor(private readonly stream: Duplex, private readonly onClose: () => void) {
    stream.on("data", (data: Buffer) => this.accept(Buffer.from(data)));
    stream.on("error", () => this.abort(new Error("Preview transport connection failed.")));
    stream.on("close", () => this.abort(new Error("Preview transport connection closed.")));
    stream.on("end", () => this.abort(new Error("Preview transport connection ended.")));
  }

  async request(path: string, method: "GET" | "HEAD"): Promise<PreviewHttpResponse> {
    if (this.closed || this.stream.destroyed) throw new Error("Preview transport unavailable.");
    if (this.pending.size >= MAX_IN_FLIGHT) throw new Error("Preview transport capacity reached.");
    if (!path.startsWith("/") || path.startsWith("//") || path.length > 4096 || /[\\\u0000-\u001f\u007f]/.test(path))
      throw new Error("Unsafe preview transport path.");
    const id = ++this.nextId;
    return new Promise<PreviewHttpResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        // A single slow or stuck optimization request is not evidence that
        // the shared Docker exec connection has failed. Isolate this request.
        const entry = this.pending.get(id);
        if (!entry) return;
        this.pending.delete(id);
        entry.reject(new Error("Preview HTTP asset response deadline exceeded."));
        this.consecutiveDeadlines += 1;
        // Discard a transport that no longer makes progress, but only after
        // already-pending requests have had their own chance to complete.
        if (this.consecutiveDeadlines >= 3 && this.pending.size === 0) {
          this.abort(new Error("Preview transport stalled."));
        }
      }, PREVIEW_HTTP_REQUEST_DEADLINE_MS);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.stream.write(JSON.stringify({ id, path, method }) + "\n", (error?: Error | null) => {
          if (error) this.abort(new Error("Preview transport write failed."));
        });
      } catch {
        this.abort(new Error("Preview transport write failed."));
      }
    });
  }

  /** Docker exec with Tty=false sends 8-byte multiplex headers around stdout. */
  private accept(chunk: Buffer) {
    if (this.closed) return;
    this.raw = Buffer.concat([this.raw, chunk]);
    while (this.raw.length >= 8) {
      const kind = this.raw[0];
      const len = this.raw.readUInt32BE(4);
      if (len > MAX_DOCKER_FRAME || (kind !== 1 && kind !== 2)) {
        this.abort(new Error("Malformed preview Docker frame."));
        return;
      }
      if (this.raw.length < 8 + len) break;
      const data = this.raw.subarray(8, 8 + len);
      this.raw = this.raw.subarray(8 + len);
      if (kind === 1) this.acceptStdout(data);
      if (this.closed) return;
    }
    if (this.raw.length > MAX_DOCKER_FRAME + 8) this.abort(new Error("Preview Docker frame overflow."));
  }

  private acceptStdout(chunk: Buffer) {
    this.text = Buffer.concat([this.text, chunk]);
    if (this.text.length > MAX_LINE) {
      this.abort(new Error("Preview transport response overflow."));
      return;
    }
    while (true) {
      const end = this.text.indexOf(10);
      if (end === -1) break;
      const line = this.text.subarray(0, end);
      this.text = this.text.subarray(end + 1);
      let reply: Record<string, unknown>;
      try { reply = JSON.parse(line.toString("utf8")) as Record<string, unknown>; }
      catch { this.abort(new Error("Invalid preview transport response.")); return; }
      const id = reply.id;
      if (typeof id !== "number") { this.abort(new Error("Invalid preview transport identity.")); return; }
      const pending = this.pending.get(id);
      if (!pending) continue; // A timed-out or already resolved response cannot be applied twice.
      clearTimeout(pending.timer);
      this.pending.delete(id);
      // Any protocol reply proves the exec channel is alive, even if Vite
      // explicitly rejected this individual URL.
      this.consecutiveDeadlines = 0;
      if (reply.error) { pending.reject(new Error(reply.error === "Connection refused" ? "Preview HTTP connection refused." : "Preview HTTP request failed.")); continue; }
      if (!Number.isInteger(reply.status) || (reply.status as number) < 100 || (reply.status as number) > 599 ||
          !reply.headers || typeof reply.headers !== "object" || Array.isArray(reply.headers) ||
          typeof reply.bodyBase64 !== "string" || reply.bodyBase64.length > MAX_LINE) {
        pending.reject(new Error("Invalid preview HTTP response."));
        continue;
      }
      pending.resolve({ status: reply.status as number,
        headers: reply.headers as Record<string, string>, bodyBase64: reply.bodyBase64 });
    }
  }

  close() { this.abort(new Error("Preview transport stopped.")); }

  private abort(error: Error) {
    if (this.closed) return;
    this.closed = true;
    for (const item of this.pending.values()) {
      clearTimeout(item.timer);
      item.reject(error);
    }
    this.pending.clear();
    this.onClose();
    if (!this.stream.destroyed) this.stream.destroy();
  }
}

const channels = new Map<string, Promise<ReactPreviewPersistentHttpChannel>>();
const connectionBeingOpened = new Map<string, Promise<ReactPreviewPersistentHttpChannel>>();

async function openChannel(containerId: string): Promise<ReactPreviewPersistentHttpChannel> {
  const exec = await docker.getContainer(containerId).exec({
    Cmd: ["/usr/bin/python3", "-u", "-c", PERSISTENT_PREVIEW_HTTP_WORKER],
    AttachStdout: true, AttachStderr: true, AttachStdin: true, Tty: false,
  });
  const stream = await exec.start({ hijack: true, stdin: true });
  return new ReactPreviewPersistentHttpChannel(stream as Duplex, () => {
    const identity = connectionBeingOpened.get(containerId);
    if (identity && channels.get(containerId) === identity) channels.delete(containerId);
    if (identity && connectionBeingOpened.get(containerId) === identity) connectionBeingOpened.delete(containerId);
  });
}

export function stopPersistentPreviewHttp(containerId: string) {
  const existing = channels.get(containerId);
  channels.delete(containerId);
  connectionBeingOpened.delete(containerId);
  if (existing) void existing.then((channel) => channel.close()).catch(() => undefined);
}

/** Lazy shared startup prevents one Docker exec per asset and per readiness poll. */
export async function fetchPersistentPreviewHttp(containerId: string, path: string, method: "GET" | "HEAD") {
  let connection = channels.get(containerId);
  if (!connection) {
    connection = openChannel(containerId);
    connectionBeingOpened.set(containerId, connection);
    channels.set(containerId, connection);
    void connection.catch(() => {
      if (channels.get(containerId) === connection) channels.delete(containerId);
      if (connectionBeingOpened.get(containerId) === connection) connectionBeingOpened.delete(containerId);
    });
  }
  const channel = await connection;
  return channel.request(path, method);
}
