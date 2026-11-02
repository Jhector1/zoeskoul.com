/**
 * Phase 3B1: strict, transport-only request boundary for a TanStack Start SSR
 * preview. This module does not authorize a request, start an executor, or
 * expose a network endpoint. The authenticated caller must first resolve a
 * currently live, owner-scoped preview capability and source version.
 *
 * Never forward control-plane cookies, authorization, forwarded/proxy headers,
 * host or origin from a browser to customer-controlled application code.
 */

export const TANSTACK_PREVIEW_MAX_REQUEST_BYTES = 256 * 1024;
export const TANSTACK_PREVIEW_MAX_RESPONSE_BYTES = 6 * 1024 * 1024;
const MAX_URL_LENGTH = 4096;
const CAPABILITY_BASE = /^\/api\/build\/projects\/[A-Za-z0-9_-]+\/preview\/[A-Za-z0-9_-]+\/content\/[A-Za-z0-9_-]{32}\/$/;
const B64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const SAFE_VALUE = /^[\x20-\x7e]+$/;
const CONTENT_TYPE = /^(?:application\/(?:json|octet-stream|x-www-form-urlencoded)|multipart\/form-data|text\/plain)(?:\s*;\s*[A-Za-z0-9_-]+=(?:[A-Za-z0-9_.:-]+|"[A-Za-z0-9_.:-]+"))*$/i;

export type TanstackPreviewMethod = "GET" | "HEAD" | "POST";
export type TanstackPreviewTransportRequest = Readonly<{
  path: string;
  method: TanstackPreviewMethod;
  headers: Readonly<{ accept: string; "content-type"?: string }>;
  bodyBase64: string;
}>;

function requireSafeHeader(value: unknown, max: number): string | null {
  if (typeof value !== "string" || !value || value.length > max || !SAFE_VALUE.test(value)) return null;
  return value;
}

function safePath(basePath: unknown, rawPath: unknown): string {
  if (typeof basePath !== "string" || !CAPABILITY_BASE.test(basePath))
    throw new Error("Invalid preview capability base.");
  if (typeof rawPath !== "string" || rawPath.length > MAX_URL_LENGTH ||
      !rawPath.startsWith(basePath) || rawPath.includes("#") ||
      /[\\\u0000-\u001f\u007f]/.test(rawPath))
    throw new Error("Unsafe full-stack preview path.");
  // Reject traversal before URL parsing, which otherwise canonicalizes dot
  // segments. Encoded separators may confuse downstream routers and proxies.
  const pathname = rawPath.split("?", 1)[0];
  for (const part of pathname.split("/")) {
    let segment: string;
    try { segment = decodeURIComponent(part); }
    catch { throw new Error("Unsafe full-stack preview path."); }
    if (segment === "." || segment === ".." || /[\\/\u0000-\u001f\u007f]/.test(segment))
      throw new Error("Unsafe full-stack preview path.");
  }
  return rawPath;
}

function safeBody(body: unknown, method: TanstackPreviewMethod): string {
  if (body === undefined || body === null || body === "") return "";
  if (method !== "POST" || typeof body !== "string" ||
      body.length > Math.ceil(TANSTACK_PREVIEW_MAX_REQUEST_BYTES / 3) * 4 || !B64.test(body))
    throw new Error("Invalid preview request body.");
  const decoded = Buffer.from(body, "base64");
  if (decoded.length > TANSTACK_PREVIEW_MAX_REQUEST_BYTES || decoded.toString("base64") !== body)
    throw new Error("Invalid preview request body.");
  return body;
}

/** Prepare a request only after the Runner has checked its authenticated owner
 * or a distinct, server-resolved full-stack capability (not the preview ID).
 * The browser cannot choose forwarded headers or arbitrary method/port.
 */
export function normalizeTanstackPreviewHttpRequest(input: Readonly<{
  basePath: unknown;
  path: unknown;
  method: unknown;
  headers?: unknown;
  bodyBase64?: unknown;
}>): TanstackPreviewTransportRequest {
  if (input.method !== "GET" && input.method !== "HEAD" && input.method !== "POST")
    throw new Error("Unsupported full-stack preview method.");
  const method = input.method;
  const path = safePath(input.basePath, input.path);
  const supplied = input.headers && typeof input.headers === "object" && !Array.isArray(input.headers)
    ? input.headers as Record<string, unknown> : {};
  const accept = requireSafeHeader(supplied.accept, 256) ?? "*/*";
  const contentType = requireSafeHeader(supplied["content-type"], 180);
  if (supplied["content-type"] !== undefined && !contentType)
    throw new Error("Invalid full-stack preview content type.");
  if (contentType && !CONTENT_TYPE.test(contentType))
    throw new Error("Unsupported full-stack preview content type.");
  const bodyBase64 = safeBody(input.bodyBase64, method);
  return {
    path, method,
    headers: contentType && method === "POST"
      ? { accept, "content-type": contentType } : { accept },
    bodyBase64,
  };
}

/** Only inert metadata is allowed back from the app. Redirects and cookies
 * require a separate preview-origin / cookie-scope design, so reject them
 * rather than silently creating cross-origin navigation or session confusion.
 */
export function normalizeTanstackPreviewHttpResponse(input: unknown): Readonly<{
  status: number;
  headers: Readonly<Record<string, string>>;
  bodyBase64: string;
}> {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Invalid full-stack preview response.");
  const record = input as Record<string, unknown>;
  if (typeof record.status !== "number" || !Number.isInteger(record.status) ||
      record.status < 200 || record.status > 599 || record.status >= 300 && record.status < 400 ||
      typeof record.bodyBase64 !== "string" || !B64.test(record.bodyBase64) ||
      record.bodyBase64.length > Math.ceil(TANSTACK_PREVIEW_MAX_RESPONSE_BYTES / 3) * 4)
    throw new Error("Invalid full-stack preview response.");
  const data = Buffer.from(record.bodyBase64, "base64");
  if (data.length > TANSTACK_PREVIEW_MAX_RESPONSE_BYTES || data.toString("base64") !== record.bodyBase64)
    throw new Error("Invalid full-stack preview response.");
  const values = record.headers && typeof record.headers === "object" && !Array.isArray(record.headers)
    ? record.headers as Record<string, unknown> : {};
  const contentType = requireSafeHeader(values["content-type"], 180);
  return {
    status: record.status,
    headers: contentType ? { "content-type": contentType, "cache-control": "no-store" }
      : { "cache-control": "no-store" },
    bodyBase64: record.bodyBase64,
  };
}
