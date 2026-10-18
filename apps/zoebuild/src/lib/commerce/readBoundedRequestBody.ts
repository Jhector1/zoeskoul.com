/**
 * Collect only a bounded number of raw request bytes. Webhook signatures
 * require the original bytes, so do not decode before verification.
 * `null` indicates a payload larger than the allowed limit.
 * Content-Length is only an early rejection hint: the stream is always bounded.
 */
export async function readBoundedRequestBody(
  request: Request,
  maxBytes: number,
): Promise<Uint8Array | null> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new RangeError("Invalid request body limit.");
  }

  const declaredLength = request.headers.get("content-length");
  if (
    declaredLength &&
    /^\d+$/.test(declaredLength) &&
    Number(declaredLength) > maxBytes
  ) {
    return null;
  }

  if (!request.body) {
    return new Uint8Array(0);
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}
