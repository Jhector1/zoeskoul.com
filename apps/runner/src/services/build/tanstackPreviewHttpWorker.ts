/**
 * Dedicated loopback-only HTTP transport for future TanStack Start previews.
 * This Python worker is run with trusted argv inside an isolated executor
 * container via docker exec (never on the ZoeBuild host). It intentionally
 * does not follow redirects, accept browser cookies, or contact arbitrary
 * destinations. Not connected to any route in Phase 3B1.
 */
export const TANSTACK_PREVIEW_HTTP_WORKER = String.raw`
import base64, binascii, concurrent.futures, http.client, json, re, socket, sys, threading, time

MAX_REQUEST = 256 * 1024
MAX_RESPONSE = 6 * 1024 * 1024
MAX_LINE = 400 * 1024
LOCK = threading.Lock()
POOL = concurrent.futures.ThreadPoolExecutor(max_workers=6)

class WorkerFailure(Exception):
    def __init__(self, code):
        self.code = code

def perform(item):
    ident = item.get("id")
    connection = None
    try:
        method, path = item.get("method"), item.get("path")
        if not isinstance(ident, int) or isinstance(ident, bool) or ident < 0:
            raise ValueError("invalid id")
        if item.get("operation") == "probe-listener":
            # Runner-internal only. Fixed loopback address, bounded polling,
            # no application request or arbitrary destination.
            budget = item.get("timeoutMs")
            if set(item) != {"id", "operation", "timeoutMs"} or not isinstance(budget, int) or isinstance(budget, bool) or not 1 <= budget <= 1000:
                raise ValueError("invalid listener probe")
            until = time.monotonic() + budget / 1000
            listening = False
            while True:
                remaining = until - time.monotonic()
                if remaining <= 0:
                    break
                try:
                    with socket.create_connection(("127.0.0.1", 5173), timeout=min(0.2, remaining)):
                        listening = True
                    break
                except OSError:
                    time.sleep(min(0.1, max(0, until - time.monotonic())))
            with LOCK:
                sys.stdout.write(json.dumps({"id": ident, "listening": listening}, separators=(",", ":")) + "\n")
                sys.stdout.flush()
            return
        if "operation" in item:
            raise ValueError("invalid operation")
        if method not in ("GET", "HEAD", "POST") or not isinstance(path, str) or len(path) > 4096:
            raise ValueError("invalid request")
        if not path.startswith("/") or path.startswith("//") or "\\" in path or "#" in path or any(ord(c) < 32 or ord(c) == 127 for c in path):
            raise ValueError("invalid path")
        raw = item.get("bodyBase64", "")
        if not isinstance(raw, str) or len(raw) > ((MAX_REQUEST + 2) // 3) * 4:
            raise ValueError("invalid body")
        body = base64.b64decode(raw, validate=True)
        if len(body) > MAX_REQUEST or (method != "POST" and body):
            raise ValueError("invalid body")
        supplied = item.get("headers", {})
        if not isinstance(supplied, dict):
            raise ValueError("invalid headers")
        headers = {"Accept": "*/*", "Accept-Encoding": "identity"}
        for key, value in (("accept", "Accept"), ("content-type", "Content-Type")):
            entry = supplied.get(key)
            if entry is not None:
                if not isinstance(entry, str) or len(entry) > 256 or any(ord(c) < 32 or ord(c) > 126 for c in entry):
                    raise ValueError("invalid headers")
                headers[value] = entry
        rpc = item.get("applicationRpc")
        mutation = rpc == "tanstack-json-post-v1"
        deadline = item.get("mutationDeadlineMs")
        def check_mutation_deadline():
            now = time.time_ns() // 1000000
            if not isinstance(deadline, int) or isinstance(deadline, bool) or deadline <= now or deadline > now + 20000:
                raise WorkerFailure("deadline")
        if mutation:
            check_mutation_deadline()
            if method != "POST" or set(supplied) != {"accept", "content-type"} or supplied.get("content-type") != "application/json" or not body or len(body) > 65536 or not re.fullmatch(r"/api/build/projects/[A-Za-z0-9_-]+/preview/preview_[a-f0-9-]+/content/[A-Za-z0-9_-]{32}/_serverFn/[A-Za-z0-9_-]{1,2048}", path):
                raise ValueError("invalid mutation request")
            parsed = json.loads(body.decode("utf-8", errors="strict"))
            if not isinstance(parsed, dict):
                raise ValueError("invalid mutation body")
        elif deadline is not None:
            raise ValueError("unexpected mutation deadline")
        if rpc is not None:
            if not mutation and (rpc != "tanstack-json-get-v1" or method != "GET" or body or set(supplied) != {"accept"} or not re.fullmatch(r"/api/build/projects/[A-Za-z0-9_-]+/preview/preview_[a-f0-9-]+/content/[A-Za-z0-9_-]{32}/_serverFn/[A-Za-z0-9_-]{1,2048}(?:\?payload=[^&]*)?", path)):
                raise ValueError("invalid rpc request")
            headers["Accept"] = "application/x-tss-framed, application/x-ndjson, application/json"
            headers["X-TSR-ServerFn"] = "true"
            # This is a fixed, trusted loopback hop, not a forwarded browser Origin.
            headers["Origin"] = "http://127.0.0.1:5173"
        # A fresh HTTPConnection per request: no shared tenant sessions.
        # Hardcoded IPv4 loopback, no redirects, no caller-selected host/port.
        connection = http.client.HTTPConnection("127.0.0.1", 5173, timeout=20)
        upstream_started = time.monotonic_ns()
        try:
            connection.connect()
        except (ConnectionRefusedError, ConnectionResetError, socket.timeout, TimeoutError, OSError):
            raise WorkerFailure("loopback_connection")
        try:
            if mutation:
                check_mutation_deadline()  # Never start an expired queued mutation.
            connection.request(method, path, body=body if method == "POST" else None, headers=headers)
            reply = connection.getresponse()
            data = reply.read(MAX_RESPONSE + 1) if method != "HEAD" else b""
        except (socket.timeout, TimeoutError, http.client.HTTPException, OSError):
            raise WorkerFailure("vite_request")
        upstream_ms = max(0, min(20000, round((time.monotonic_ns() - upstream_started) / 1000000, 1)))
        if len(data) > MAX_RESPONSE:
            raise WorkerFailure("vite_response")
        header_type = reply.getheader("Content-Type", "")
        safe_headers = {"content-type": header_type} if isinstance(header_type, str) and 0 < len(header_type) <= 180 else {}
        if rpc in ("tanstack-json-get-v1", "tanstack-json-post-v1"):
            flags = [v for k, v in reply.getheaders() if k.lower() == "x-tss-serialized"]
            raw_flags = [v for k, v in reply.getheaders() if k.lower() == "x-tss-raw"]
            if flags == ["true"] and not raw_flags:
                safe_headers["x-tss-serialized"] = "true"
        result = {"id": ident, "status": reply.status, "headers": safe_headers,
                  "bodyBase64": base64.b64encode(data).decode("ascii"),
                  "upstreamDurationMs": upstream_ms}
    except WorkerFailure as error:
        result = {"id": ident, "error": error.code}
    except ValueError:
        result = {"id": ident, "error": "worker_protocol"}
    except Exception:
        result = {"id": ident, "error": "worker_protocol"}
    finally:
        if connection is not None:
            try: connection.close()
            except Exception: pass
    with LOCK:
        sys.stdout.write(json.dumps(result, separators=(",", ":")) + "\n")
        sys.stdout.flush()

for line in sys.stdin:
    if len(line) > MAX_LINE:
        continue
    try:
        item = json.loads(line)
        if isinstance(item, dict):
            POOL.submit(perform, item)
    except Exception:
        continue
POOL.shutdown(wait=True)
`;
