/** Shared Phase 4E1 browser request boundary; no source bytes accepted.
 * The 4 KiB limit is enforced while streaming, even without Content-Length.
 * Valid bodies consist solely of {"sourceVersion": <positive safe integer>}.
 */
export class DevelopmentPreviewBodyError extends Error {
  constructor(readonly status: 400 | 413) {
    super(status === 413 ? "Development preview request too large." : "Invalid development preview request.");
  }
}

/** Shared bounded JSON reader for revision and grant control requests. */
export async function readDevelopmentPreviewControlBody(request: Request): Promise<Record<string,unknown>> {
  const type = request.headers.get("content-type") ?? "";
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(type.trim()))
    throw new DevelopmentPreviewBodyError(400);
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > 4096))
    throw new DevelopmentPreviewBodyError(413);
  if (!request.body) throw new DevelopmentPreviewBodyError(400);
  const reader = request.body.getReader();
  const pieces: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 4096) throw new DevelopmentPreviewBodyError(413);
      pieces.push(part.value);
    }
  } finally {
    // On over-limit/error, cancel the remaining upload. After EOF it is a noop.
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  try {
    const raw = new Uint8Array(bytes);
    let offset = 0;
    for (const piece of pieces) {raw.set(piece,offset);offset += piece.byteLength;}
    const parsed: unknown = JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(raw));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new DevelopmentPreviewBodyError(400);
    return parsed as Record<string,unknown>;
  } catch {
    throw new DevelopmentPreviewBodyError(400);
  }
}

export async function readDevelopmentPreviewRevision(request: Request): Promise<number> {
    const body = await readDevelopmentPreviewControlBody(request);
    if (Object.keys(body).length !== 1 ||
        !Object.prototype.hasOwnProperty.call(body,"sourceVersion") ||
        !Number.isSafeInteger(body.sourceVersion) ||
        typeof body.sourceVersion !== "number" || body.sourceVersion < 1)
      throw new DevelopmentPreviewBodyError(400);
    return body.sourceVersion;
}
