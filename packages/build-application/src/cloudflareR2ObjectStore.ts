/**
 * ZoeBuild AI4B2 — private Cloudflare R2 object storage adapter.
 *
 * AWS Signature V4 over native fetch, with no SDK / workspace dependency added.
 * All inputs remain server-owned. This intentionally exposes NO public URLs,
 * upload presigning, deletion, listing or arbitrary S3 commands.
 * Media and publish artifacts use separate fixed private key policies.
 */
import type { BuildMediaPrivateObjectStore } from "./projectMediaStorage";

export type BuildMediaR2Configuration = Readonly<{
  accountId: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}>;

export class BuildMediaR2Error extends Error {
  readonly code: string;
  readonly status: number | null;
  constructor(code: string, status: number | null = null) {
    super(code);
    this.code = code;
    this.status = status;
    this.name = "BuildMediaR2Error";
  }
}

const IMAGE_BYTES_LIMIT = 20 * 1024 * 1024; // Must not exceed BUILD_MEDIA_LIMITS.imageBytes.
const KEY = /^project-media\/[A-Za-z0-9_-]{4,128}\/[A-Za-z0-9_-]{4,128}\/[A-Za-z0-9_-]{10,128}\/[0-9a-f]{64}$/;
const THUMBNAIL_KEY = /^project-thumbnails\/[0-9a-f]{64}\/[A-Za-z0-9_-]{4,128}\/[1-9][0-9]{0,15}\/homepage-v1$/;
const PUBLISH_KEY = /^published-artifacts\/[A-Za-z0-9_-]{4,128}\/[A-Za-z0-9_-]{4,128}\/[1-9][0-9]{0,15}\/[0-9a-f]{64}\/[0-9a-f]{64}$/;
export const PUBLISH_BUNDLE_BYTES_LIMIT = 56 * 1024 * 1024;
const BUCKET = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/;
const HEX_ACCOUNT = /^[0-9a-f]{32}$/;
const ACCESS_KEY = /^[A-Za-z0-9]{16,128}$/;
const SECRET_KEY = /^[A-Za-z0-9+\/=_-]{16,256}$/;
const IMAGE_MIME = new Set(["image/png", "image/jpeg", "image/webp", "image/avif"]);
const encoder = new TextEncoder();

function refuse(code: string): never { throw new BuildMediaR2Error(code); }
function hex(bytes: Uint8Array): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}
async function sha256(data: Uint8Array): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", Uint8Array.from(data))));
}
async function hmac(key: Uint8Array, value: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey("raw", Uint8Array.from(key), {name: "HMAC", hash: "SHA-256"}, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(value)));
}
function safeConfig(input: BuildMediaR2Configuration): BuildMediaR2Configuration {
  if (!input || !HEX_ACCOUNT.test(input.accountId) || !BUCKET.test(input.bucket) ||
      !ACCESS_KEY.test(input.accessKeyId) || !SECRET_KEY.test(input.secretAccessKey)) {
    refuse("BUILD_MEDIA_R2_CONFIG_INVALID");
  }
  return {...input};
}
function safeKey(key: string, pattern: RegExp): string {
  if (typeof key !== "string" || !pattern.test(key)) refuse("BUILD_MEDIA_R2_KEY_INVALID");
  return key;
}

/** Keeps the signer unit-testable without permitting arbitrary HTTP origins. */
type R2Options = Readonly<{fetchImpl?: typeof fetch; now?: () => Date; timeoutMs?: number}>;

export function createCloudflareR2PrivateObjectStore(rawConfig: BuildMediaR2Configuration, options: R2Options = {}): BuildMediaPrivateObjectStore {
  return createPrivateStore(rawConfig, options, KEY, IMAGE_BYTES_LIMIT, IMAGE_MIME).store;
}

/** Separate trusted publisher credentials/bucket; never widens the media store. */
export function createCloudflareR2PublishBundleStore(rawConfig: BuildMediaR2Configuration, options: R2Options = {}): BuildMediaPrivateObjectStore {
  return createPrivateStore(rawConfig, options, PUBLISH_KEY, PUBLISH_BUNDLE_BYTES_LIMIT, new Set(["application/json"])).store;
}

/** Only the thumbnail adapter can replace an object, for an explicit refresh. */
export interface BuildThumbnailObjectStore extends BuildMediaPrivateObjectStore {
  replace(input: Parameters<BuildMediaPrivateObjectStore["putIfAbsent"]>[0]): Promise<void>;
}
export function createCloudflareR2ThumbnailStore(rawConfig: BuildMediaR2Configuration, options: R2Options = {}): BuildThumbnailObjectStore {
  const {store, replace} = createPrivateStore(rawConfig, options, THUMBNAIL_KEY, 512 * 1024, new Set(["image/jpeg"]), false);
  return {...store, replace};
}

function createPrivateStore(rawConfig: BuildMediaR2Configuration, options: R2Options,
  keyPattern: RegExp, maxBytes: number, mimeTypes: ReadonlySet<string>, digestInKey = true) {
  const config = safeConfig(rawConfig);
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => new Date());
  const timeoutMs = options.timeoutMs ?? 30_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 120_000) {
    refuse("BUILD_MEDIA_R2_TIMEOUT_INVALID");
  }
  const host = `${config.accountId}.r2.cloudflarestorage.com`;

  async function signedRequest(input: Readonly<{
    method: "GET" | "PUT";
    key: string;
    bytes?: Uint8Array;
    mimeType?: string;
    replace?: boolean;
  }>): Promise<Response> {
    const key = safeKey(input.key, keyPattern);
    const path = `/${config.bucket}/${key}`; // Strict ASCII key grammar; no dot segments or escaping.
    const instant = now();
    if (!(instant instanceof Date) || !Number.isFinite(instant.valueOf())) {
      refuse("BUILD_MEDIA_R2_CLOCK_INVALID");
    }
    const amzDate = instant.toISOString().replace(/[-:]|\.\d{3}/g, "");
    const date = amzDate.slice(0, 8);
    const digest = input.method === "PUT" ? await sha256(input.bytes!) : await sha256(new Uint8Array());
    const headers: Record<string, string> = {
      host,
      "x-amz-content-sha256": digest,
      "x-amz-date": amzDate,
    };
    if (input.method === "PUT") {
      headers["content-type"] = input.mimeType!;
      if (!input.replace) headers["if-none-match"] = "*";
    }
    const headerNames = Object.keys(headers).sort();
    const signedHeaders = headerNames.join(";");
    const canonicalHeaders = headerNames.map(name => `${name}:${headers[name]}\n`).join("");
    const canonicalRequest = [input.method, path, "", canonicalHeaders, signedHeaders, digest].join("\n");
    const scope = `${date}/auto/s3/aws4_request`;
    const toSign = ["AWS4-HMAC-SHA256", amzDate, scope,
      await sha256(encoder.encode(canonicalRequest))].join("\n");
    let signingKey = await hmac(encoder.encode(`AWS4${config.secretAccessKey}`), date);
    signingKey = await hmac(signingKey, "auto");
    signingKey = await hmac(signingKey, "s3");
    signingKey = await hmac(signingKey, "aws4_request");
    const signature = hex(await hmac(signingKey, toSign));
    const authorization = `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    const requestHeaders = new Headers(headers);
    requestHeaders.set("authorization", authorization);
    // 'host' is owned by fetch/URL (can't be spoofed); the signer still signs it.
    requestHeaders.delete("host");
    try {
      return await fetchImpl(`https://${host}${path}`, {
        method: input.method,
        headers: requestHeaders,
        ...(input.method === "PUT" ? {body: Uint8Array.from(input.bytes!)} : {}),
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      // No exception details: errors from SDK/network clients can contain URLs or secrets.
      throw new BuildMediaR2Error("BUILD_MEDIA_R2_NETWORK_UNAVAILABLE");
    }
  }

  async function put({key, bytes, mimeType, sha256: expectedDigest}: Parameters<BuildMediaPrivateObjectStore["putIfAbsent"]>[0], replace: boolean): Promise<"created" | "already-exists"> {
      if (replace && keyPattern !== THUMBNAIL_KEY) refuse("BUILD_MEDIA_R2_UPLOAD_INVALID");
      safeKey(key, keyPattern);
      if (!(bytes instanceof Uint8Array) || bytes.length === 0 || bytes.length > maxBytes ||
          !mimeTypes.has(mimeType) || !/^[0-9a-f]{64}$/.test(expectedDigest)) {
        refuse("BUILD_MEDIA_R2_UPLOAD_INVALID");
      }
      const snapshot = Uint8Array.from(bytes);
      if (await sha256(snapshot) !== expectedDigest || (digestInKey && key.split("/").at(-1) !== expectedDigest)) {
        refuse("BUILD_MEDIA_R2_UPLOAD_DIGEST_MISMATCH");
      }
      const response = await signedRequest({method: "PUT", key, bytes: snapshot, mimeType, replace});
      try {
        if (response.status === 200 || response.status === 201 || response.status === 204) return "created";
        if (!replace && response.status === 412) return "already-exists";
        throw new BuildMediaR2Error("BUILD_MEDIA_R2_WRITE_FAILED", response.status);
      } finally { await response.body?.cancel().catch(() => {}); }
  }
  const store: BuildMediaPrivateObjectStore = {
    putIfAbsent: input => put(input, false),
    async read(key) {
      safeKey(key, keyPattern);
      const response = await signedRequest({method: "GET", key});
      if (response.status === 404) { await response.body?.cancel().catch(() => {}); return null; }
      if (response.status !== 200) {
        await response.body?.cancel().catch(() => {});
        throw new BuildMediaR2Error("BUILD_MEDIA_R2_READ_FAILED", response.status);
      }
      const sizeHeader = response.headers.get("content-length");
      if (sizeHeader !== null && (!/^\d+$/.test(sizeHeader) || Number(sizeHeader) > maxBytes)) {
        await response.body?.cancel().catch(() => {});
        refuse("BUILD_MEDIA_R2_READ_TOO_LARGE");
      }
      if (!response.body) refuse("BUILD_MEDIA_R2_READ_EMPTY");
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      try {
        while (true) {
          const {done, value} = await reader.read();
          if (done) break;
          total += value.byteLength;
          if (total > maxBytes) {
            await reader.cancel().catch(() => {});
            refuse("BUILD_MEDIA_R2_READ_TOO_LARGE");
          }
          chunks.push(Uint8Array.from(value));
        }
      } finally { reader.releaseLock(); }
      const result = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
      return result;
    },
  };
  return {store, async replace(input: Parameters<BuildMediaPrivateObjectStore["putIfAbsent"]>[0]) { await put(input, true); }};
}
