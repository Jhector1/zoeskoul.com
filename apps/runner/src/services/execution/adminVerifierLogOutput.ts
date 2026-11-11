import type { Readable } from "node:stream";
import { TextDecoder } from "node:util";

/** Dockerode logs() may resolve to a Readable, not a Buffer. Never trust unbounded logs. */
const MAX_VERIFIER_LOG_BYTES = 8192;
const VERIFIER_LOG_TIMEOUT_MS = 5000;

export class AdminVerifierLogOutputUnavailable extends Error {
  constructor() {
    super("Administrative filesystem verifier output is unavailable.");
  }
}


/**
 * Dockerode can JSON-decode application/json container logs before returning
 * them. Treat that response as untrusted evidence, not an arbitrary object.
 * The caller still verifies that every failed path was actually requested.
 */
function readParsedDockerodeVerifierResult(source: object): string {
  try {
    const prototype = Object.getPrototypeOf(source);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error("non-plain result");
    }

    const keys = Reflect.ownKeys(source);
    if (keys.length !== 2 || !keys.includes("ok") || !keys.includes("failedPaths")) {
      throw new Error("unexpected result keys");
    }

    const okProperty = Object.getOwnPropertyDescriptor(source, "ok");
    const failedProperty = Object.getOwnPropertyDescriptor(source, "failedPaths");
    if (!okProperty || !Object.hasOwn(okProperty, "value") ||
        !failedProperty || !Object.hasOwn(failedProperty, "value") ||
        okProperty.value !== true || !Array.isArray(failedProperty.value)) {
      throw new Error("invalid result fields");
    }

    const failedPaths: unknown[] = failedProperty.value;
    if (Object.getPrototypeOf(failedPaths) !== Array.prototype || failedPaths.length > 8 ||
        Reflect.ownKeys(failedPaths).length !== failedPaths.length + 1) {
      throw new Error("invalid result array");
    }

    const checked: string[] = [];
    for (let i = 0; i < failedPaths.length; i++) {
      const entry = Object.getOwnPropertyDescriptor(failedPaths, String(i));
      if (!entry || !Object.hasOwn(entry, "value") || typeof entry.value !== "string" ||
          !entry.value.startsWith("/workspace/") || entry.value.length > 512) {
        throw new Error("invalid result path");
      }
      checked.push(entry.value);
    }
    if (new Set(checked).size !== checked.length) {
      throw new Error("duplicate result path");
    }

    const canonical = JSON.stringify({ ok: true, failedPaths: checked });
    if (Buffer.byteLength(canonical, "utf8") === 0 ||
        Buffer.byteLength(canonical, "utf8") > MAX_VERIFIER_LOG_BYTES) {
      throw new Error("result too large");
    }
    return canonical;
  } catch {
    throw new AdminVerifierLogOutputUnavailable();
  }
}

export async function readAdminVerifierLogOutput(
  source: unknown,
  timeoutMs = VERIFIER_LOG_TIMEOUT_MS,
): Promise<string> {
  let bytes: Buffer;

  if (Buffer.isBuffer(source)) {
    bytes = source;
  } else {
    if (!source || typeof source !== "object") {
      throw new AdminVerifierLogOutputUnavailable();
    }

    const stream = source as Readable;
    if (typeof stream[Symbol.asyncIterator] !== "function" ||
        typeof stream.destroy !== "function") {
      return readParsedDockerodeVerifierResult(source);
    }

    const chunks: Buffer[] = [];
    let totalBytes = 0;
    const timer = setTimeout(() => {
      stream.destroy(new AdminVerifierLogOutputUnavailable());
    }, timeoutMs);

    try {
      for await (const chunk of stream) {
        if (typeof chunk !== "string" && !(chunk instanceof Uint8Array)) {
          throw new AdminVerifierLogOutputUnavailable();
        }
        const part = typeof chunk === "string" ? Buffer.from(chunk, "utf8") : Buffer.from(chunk);
        totalBytes += part.byteLength;
        if (totalBytes > MAX_VERIFIER_LOG_BYTES) {
          throw new AdminVerifierLogOutputUnavailable();
        }
        chunks.push(part);
      }
      if (!stream.readableEnded) {
        throw new AdminVerifierLogOutputUnavailable();
      }
      bytes = Buffer.concat(chunks, totalBytes);
    } catch {
      throw new AdminVerifierLogOutputUnavailable();
    } finally {
      clearTimeout(timer);
      if (!stream.destroyed) stream.destroy();
    }
  }

  if (bytes.byteLength === 0 || bytes.byteLength > MAX_VERIFIER_LOG_BYTES) {
    throw new AdminVerifierLogOutputUnavailable();
  }
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes).trim();
    if (!text) throw new Error("empty verifier output");
    return text;
  } catch {
    throw new AdminVerifierLogOutputUnavailable();
  }
}
