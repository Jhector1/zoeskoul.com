/** Bounded streaming JSON body reader for privileged handoff service calls. */
export async function readLimitedHandoffJson(request: Request, maxBytes = 2048): Promise<Record<string, unknown> | null> {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const pieces: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      pieces.push(chunk.value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const part of pieces) { bytes.set(part, offset); offset += part.byteLength; }
    const decoded: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return decoded && typeof decoded === "object" && !Array.isArray(decoded)
      ? decoded as Record<string, unknown> : null;
  } catch { return null; }
  finally { reader.releaseLock(); }
}
