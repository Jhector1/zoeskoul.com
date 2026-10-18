import { createHmac, timingSafeEqual } from "node:crypto";
import http from "node:http";
import { isIP } from "node:net";

const SIGNED_FIELDS = [
  "x-zoebuild-buyer-ip",
  "x-zoebuild-buyer-ip-timestamp",
  "x-zoebuild-buyer-ip-signature",
];
const EDGE_FIELDS = ["x-zoebuild-edge-auth", "x-zoebuild-edge-ip"];
const HOP_FIELDS = new Set([
  "connection", "proxy-connection", "keep-alive", "upgrade", "te", "trailer",
  "transfer-encoding", "proxy-authenticate", "proxy-authorization", "host",
  ...SIGNED_FIELDS, ...EDGE_FIELDS,
  "x-forwarded-for", "x-real-ip", "cf-connecting-ip",
]);

function equalSecret(supplied, expected) {
  if (typeof supplied !== "string") return false;
  const a = Buffer.from(supplied, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

function soleHeader(req, name) {
  const values = req.headersDistinct?.[name];
  if (!Array.isArray(values) || values.length !== 1) return null;
  return values[0];
}

export function createSignerHandler({ edgeSecret, signingKey, upstreamHost, upstreamPort = 3004, now = Date.now }) {
  if (typeof edgeSecret !== "string" || Buffer.byteLength(edgeSecret, "utf8") < 32) {
    throw new Error("Ingress edge authentication secret missing or too short");
  }
  if (typeof signingKey !== "string" || Buffer.byteLength(signingKey, "utf8") < 32) {
    throw new Error("Buyer IP signing key missing or too short");
  }
  if (equalSecret(edgeSecret, signingKey)) {
    throw new Error("Ingress edge and buyer IP signing secrets must differ");
  }
  if (typeof upstreamHost !== "string" || !/^[a-z0-9][a-z0-9.-]*$/i.test(upstreamHost)) {
    throw new Error("Invalid fixed upstream hostname");
  }
  if (!Number.isInteger(upstreamPort) || upstreamPort < 1 || upstreamPort > 65535) {
    throw new Error("Invalid upstream port");
  }

  return (req, res) => {
    const reject = (code, message) => {
      res.writeHead(code, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", connection: "close" });
      res.end(message);
    };
    if (req.method === "GET" && req.url === "/_zoebuild_internal/health") {
      // This path must be blocked from the public Caddy route.
      res.writeHead(204, { "cache-control": "no-store" });
      res.end();
      return;
    }
    const edgeAuth = soleHeader(req, "x-zoebuild-edge-auth");
    const edgeIp = soleHeader(req, "x-zoebuild-edge-ip");
    if (!equalSecret(edgeAuth, edgeSecret) || !edgeIp || edgeIp !== edgeIp.trim() || !isIP(edgeIp)) {
      reject(403, "Forbidden");
      return;
    }
    const path = req.url;
    if (!path || !path.startsWith("/") || path.startsWith("//") || /[\r\n\\]/.test(path)) {
      reject(400, "Invalid request target");
      return;
    }
    let pathname;
    try {
      pathname = new URL(path, "http://internal.invalid").pathname;
    } catch {
      reject(400, "Invalid request target");
      return;
    }
    if (!pathname.startsWith("/") || !req.method || !/^[A-Z]+$/.test(req.method)) {
      reject(400, "Invalid request target");
      return;
    }
    const timestamp = String(Math.floor(now() / 1000));
    const payload = `v1\n${req.method}\n${pathname}\n${timestamp}\n${edgeIp}`;
    const signature = createHmac("sha256", signingKey).update(payload, "utf8").digest("hex");
    const connectionTokens = new Set(String(req.headers.connection || "").toLowerCase().split(",").map(v => v.trim()).filter(Boolean));
    const forwarded = {};
    for (const [name, value] of Object.entries(req.headers)) {
      if (!HOP_FIELDS.has(name) && !connectionTokens.has(name) && value !== undefined) forwarded[name] = value;
    }
    // Caddy must overwrite these headers before the signer sees them. We additionally
    // discard all untrusted ingress/client variants instead of letting them reach Next.
    forwarded["x-zoebuild-buyer-ip"] = edgeIp;
    forwarded["x-zoebuild-buyer-ip-timestamp"] = timestamp;
    forwarded["x-zoebuild-buyer-ip-signature"] = signature;
    forwarded["x-forwarded-for"] = edgeIp;
    forwarded["x-real-ip"] = edgeIp;
    forwarded["x-forwarded-proto"] = "https";
    // The incoming Host is not used for upstream selection, but preserve it for Next origins.
    const host = soleHeader(req, "host");
    if (!host || host.includes("/") || /[\r\n]/.test(host)) {
      reject(400, "Invalid host");
      return;
    }
    forwarded.host = host;

    const upstream = http.request({
      hostname: upstreamHost,
      port: upstreamPort,
      method: req.method,
      path,
      headers: forwarded,
      timeout: 30_000,
      agent: false,
    }, upstreamResponse => {
      const responseHeaders = { ...upstreamResponse.headers };
      for (const header of ["connection", "keep-alive", "transfer-encoding", "upgrade"]) delete responseHeaders[header];
      res.writeHead(upstreamResponse.statusCode ?? 502, responseHeaders);
      upstreamResponse.pipe(res);
    });
    upstream.on("timeout", () => upstream.destroy(new Error("Upstream timeout")));
    upstream.on("error", () => {
      if (!res.headersSent) reject(502, "Upstream unavailable");
      else res.destroy();
    });
    req.on("aborted", () => upstream.destroy());
    req.pipe(upstream);
  };
}
