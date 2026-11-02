/**
 * Dedicated loopback-only HTTP transport for future TanStack Start previews.
 * This Python worker is run with trusted argv inside an isolated executor
 * container via docker exec (never on the ZoeBuild host). It intentionally
 * does not follow redirects, accept browser cookies, or contact arbitrary
 * destinations. Not connected to any route in Phase 3B1.
 */
export const TANSTACK_PREVIEW_HTTP_WORKER = String.raw`
import base64, binascii, concurrent.futures, http.client, json, sys, threading

MAX_REQUEST = 256 * 1024
MAX_RESPONSE = 6 * 1024 * 1024
MAX_LINE = 400 * 1024
LOCK = threading.Lock()
POOL = concurrent.futures.ThreadPoolExecutor(max_workers=6)

def perform(item):
    ident = item.get("id")
    connection = None
    try:
        method, path = item.get("method"), item.get("path")
        if not isinstance(ident, int) or isinstance(ident, bool) or ident < 0:
            raise ValueError("invalid id")
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
        # A fresh HTTPConnection per request: no shared tenant sessions.
        # Hardcoded IPv4 loopback, no redirects, no caller-selected host/port.
        connection = http.client.HTTPConnection("127.0.0.1", 5173, timeout=20)
        connection.request(method, path, body=body if method == "POST" else None, headers=headers)
        reply = connection.getresponse()
        data = reply.read(MAX_RESPONSE + 1) if method != "HEAD" else b""
        if len(data) > MAX_RESPONSE:
            raise ValueError("response too large")
        header_type = reply.getheader("Content-Type", "")
        safe_headers = {"content-type": header_type} if isinstance(header_type, str) and 0 < len(header_type) <= 180 else {}
        result = {"id": ident, "status": reply.status, "headers": safe_headers,
                  "bodyBase64": base64.b64encode(data).decode("ascii")}
    except Exception:
        result = {"id": ident, "error": "Full-stack preview transport request failed"}
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
