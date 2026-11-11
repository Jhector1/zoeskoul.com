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
      throw new AdminVerifierLogOutputUnavailable();
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
