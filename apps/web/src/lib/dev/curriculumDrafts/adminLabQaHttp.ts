import { NextResponse } from "next/server";
import { isDraftAdminLabQaEnabled } from "./adminLabQaPolicy";

export function rejectDraftAdminQa(error: string, status: number) {
  return NextResponse.json({ok: false, error, draftQa: true}, {status, headers: {"Cache-Control": "no-store"}});
}

/** No privileged draft operations in production or without explicit editor opt-in. */
export function checkDraftAdminQaRequest(request: Request, mutation = true): Response | null {
  if (!isDraftAdminLabQaEnabled()) return rejectDraftAdminQa("Not found.", 404);
  if (mutation && request.headers.get("origin") !== new URL(request.url).origin) {
    return rejectDraftAdminQa("Forbidden.", 403);
  }
  return null;
}

/** Bound upload while reading, including chunked bodies. */
export async function readDraftAdminQaBody(request: Request, limit = 4096): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new Error("Expected JSON request.");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Missing JSON body.");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > limit) {
        await reader.cancel();
        throw new Error("Request too large.");
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new Error("Invalid JSON body."); }
}
