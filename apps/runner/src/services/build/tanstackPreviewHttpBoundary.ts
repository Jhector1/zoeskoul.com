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

/** Explicit internal protocol; never inferred from a browser header. */
export const TANSTACK_JSON_GET_RPC = "tanstack-json-get-v1" as const;
export type TanstackJsonGetRpc = typeof TANSTACK_JSON_GET_RPC;
export const TANSTACK_JSON_POST_RPC = "tanstack-json-post-v1" as const;
export type TanstackJsonRpc = TanstackJsonGetRpc | typeof TANSTACK_JSON_POST_RPC;
export const TANSTACK_RPC_MAX_MUTATION_BYTES = 64 * 1024;
export const TANSTACK_RPC_MUTATION_ADMISSION_MS = 20_000;

export const TANSTACK_RPC_ACCEPT = "application/x-tss-framed, application/x-ndjson, application/json";

/** The first implementation supports only canonical generated src/ function IDs.
 * Do not decode a caller-selected filesystem path or allow alternate RPC prefixes. */
export function assertTanstackJsonGetRpcPath(relative: string): void {
  if (typeof relative !== "string" || relative.length > 4096 || /[\\#\u0000-\u0020\u007f]/.test(relative))
    throw new Error("Invalid preview RPC path.");
  const [pathname, ...query] = relative.split("?");
  const match = /^_serverFn\/([A-Za-z0-9_-]{1,2048})$/.exec(pathname ?? "");
  if (!match || query.length > 1) throw new Error("Invalid preview RPC path.");
  const encoded = match[1]!;
  const decoded = Buffer.from(encoded, "base64url");
  if (decoded.toString("base64url") !== encoded) throw new Error("Invalid preview RPC identity.");
  const id: unknown = JSON.parse(decoded.toString("utf8"));
  if (!id || typeof id !== "object" || Array.isArray(id)) throw new Error("Invalid preview RPC identity.");
  const value = id as Record<string, unknown>;
  if (Object.keys(value).sort().join(",") !== "export,file" ||
      typeof value.file !== "string" || typeof value.export !== "string" ||
      !/^\/src\/(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+\.(?:ts|tsx|js|jsx)\?tss-serverfn-split$/.test(value.file) ||
      value.file.split("?",1)[0]!.split("/").some(part=>part==="." || part==="..") ||
      !/^[A-Za-z_$][A-Za-z0-9_$]{0,255}$/.test(value.export))
    throw new Error("Invalid preview RPC identity.");
  if (query.length) {
    const raw = query[0]!;
    if (!/^payload=[^&]*$/.test(raw)) throw new Error("Invalid preview RPC query.");
    const text = decodeURIComponent(raw.slice(8).replace(/\+/g," "));
    JSON.parse(text);
  }
}

export type TanstackPreviewMethod = "GET" | "HEAD" | "POST";
export type TanstackPreviewTransportRequest = Readonly<{
  path: string;
  method: TanstackPreviewMethod;
  headers: Readonly<{ accept: string; "content-type"?: string }>;
  bodyBase64: string;
  applicationRpc?: TanstackJsonRpc;
  mutationDeadlineMs?: number;
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

export function assertTanstackJsonPostRpcBody(body: unknown): string {
  if (typeof body !== "string" || body.length > Math.ceil(TANSTACK_RPC_MAX_MUTATION_BYTES / 3) * 4)
    throw new Error("Invalid preview mutation body.");
  const canonical = safeBody(body,"POST");
  const data=Buffer.from(canonical,"base64");
  if(!data.length || data.length>TANSTACK_RPC_MAX_MUTATION_BYTES)
    throw new Error("Invalid preview mutation body.");
  const text=new TextDecoder("utf-8",{fatal:true}).decode(data);
  const json:unknown=JSON.parse(text);
  if(!json || typeof json!=="object" || Array.isArray(json))throw new Error("Invalid preview mutation body.");
  return canonical;
}
export function assertTanstackJsonPostRpcPath(relative:string):void {
  if(relative.includes("?"))throw new Error("Invalid preview mutation path.");
  assertTanstackJsonGetRpcPath(relative);
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
  applicationRpc?: unknown;
  mutationDeadlineMs?: unknown;
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
  if (input.applicationRpc === TANSTACK_JSON_POST_RPC) {
    const deadline=input.mutationDeadlineMs;
    const now=Date.now();
    if(method!=="POST" || typeof input.basePath!=="string" ||
      Object.keys(supplied).sort().join(",")!=="accept,content-type" || supplied.accept!=="*/*" ||
      contentType!=="application/json" || typeof deadline!=="number" || !Number.isSafeInteger(deadline) ||
      deadline<=now || deadline>now+TANSTACK_RPC_MUTATION_ADMISSION_MS)
      throw new Error("Invalid preview mutation request.");
    assertTanstackJsonPostRpcPath(path.slice(input.basePath.length));
    assertTanstackJsonPostRpcBody(bodyBase64);
    return {path,method,headers:{accept:TANSTACK_RPC_ACCEPT,"content-type":"application/json"},bodyBase64,
      applicationRpc:TANSTACK_JSON_POST_RPC,mutationDeadlineMs:deadline};
  }
  if(input.mutationDeadlineMs!==undefined)throw new Error("Unexpected preview mutation deadline.");
  if (input.applicationRpc !== undefined) {
    if (input.applicationRpc !== TANSTACK_JSON_GET_RPC || method !== "GET" || bodyBase64 ||
        Object.keys(supplied).some(k=>k!=="accept") || (supplied.accept !== undefined && supplied.accept !== "*/*") || accept !== "*/*" || typeof input.basePath !== "string")
      throw new Error("Invalid preview RPC request.");
    assertTanstackJsonGetRpcPath(path.slice(input.basePath.length));
    return {path, method, headers:{accept:TANSTACK_RPC_ACCEPT}, bodyBase64, applicationRpc:TANSTACK_JSON_GET_RPC};
  }
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
export function normalizeTanstackPreviewHttpResponse(input: unknown, applicationRpc?: TanstackJsonRpc): Readonly<{
  status: number;
  headers: Readonly<Record<string, string>>;
  bodyBase64: string;
  upstreamDurationMs: number | null;
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
  const upstreamDurationMs = typeof record.upstreamDurationMs === "number" &&
    Number.isFinite(record.upstreamDurationMs) && record.upstreamDurationMs >= 0 &&
    record.upstreamDurationMs <= 20_000
    ? Math.round(record.upstreamDurationMs * 10) / 10 : null;
  if (applicationRpc !== undefined) {
    // Only finite, serialized JSON; framing, raw responses, redirects and
    // application cookies are deliberately unsupported in this foundation.
    if ((applicationRpc !== TANSTACK_JSON_GET_RPC && applicationRpc !== TANSTACK_JSON_POST_RPC) || !contentType ||
        !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(contentType) ||
        values["x-tss-serialized"] !== "true" || values["x-tss-raw"] !== undefined)
      throw new Error("Unsupported preview RPC response.");
    if(applicationRpc===TANSTACK_JSON_POST_RPC && (record.status===204 || record.status===205 || data.length > 1024 * 1024))
      throw new Error("Unsupported preview mutation response.");
    const utf8 = data.toString("utf8");
    if (!Buffer.from(utf8,"utf8").equals(data)) throw new Error("Invalid preview RPC response.");
    JSON.parse(utf8);
    return {status:record.status, headers:{"content-type":contentType,"cache-control":"no-store","x-tss-serialized":"true"},bodyBase64:record.bodyBase64,upstreamDurationMs};
  }
  return {
    status: record.status,
    headers: contentType ? { "content-type": contentType, "cache-control": "no-store" }
      : { "cache-control": "no-store" },
    bodyBase64: record.bodyBase64,
    upstreamDurationMs,
  };
}
