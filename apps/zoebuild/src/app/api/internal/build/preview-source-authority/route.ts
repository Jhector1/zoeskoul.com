import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { BUILD_EXECUTOR_HTTP_BODY_LIMIT_BYTES } from "@zoeskoul/build-executor-contracts";
import { attestCurrentTanstackSavedPreviewSource } from "@/lib/build/reactPreviewSourceAttestationServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIMIT = BUILD_EXECUTOR_HTTP_BODY_LIMIT_BYTES;
function respond(ok: boolean, status: number) {
  return NextResponse.json({ ok }, { status, headers: {
    "Cache-Control": "no-store, max-age=0",
    "X-Content-Type-Options": "nosniff",
  } });
}

function validServiceSecret(value: string | null): boolean {
  const expected = process.env.ZOEBUILD_PREVIEW_AUTHORITY_SHARED_SECRET;
  if (!expected || expected.length < 32 || !value) return false;
  const a = Buffer.from(value, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

async function readBoundedJson(req: Request): Promise<unknown> {
  if (!req.body) throw new Error("invalid_body");
  const reader = req.body.getReader();
  const chunks: Buffer[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > LIMIT) throw new Error("too_large");
      chunks.push(Buffer.from(value));
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(Buffer.concat(chunks, length).toString("utf8"));
}

/** Dedicated server-to-server authority, OFF by default. Never use browser
 * cookies, origin headers, or a browser-supplied actor as proof of service
 * identity. This endpoint only answers boolean; it never changes a preview.
 */
export async function POST(req: Request) {
  if (process.env.ZOEBUILD_PREVIEW_AUTHORITY_ENABLED !== "true")
    return respond(false, 503);
  if (!validServiceSecret(req.headers.get("x-zoebuild-preview-authority")))
    return respond(false, 403);
  const stated = req.headers.get("content-length");
  if (stated && (!/^\d+$/.test(stated) || Number(stated) > LIMIT))
    return respond(false, 413);
  let body: unknown;
  try { body = await readBoundedJson(req); }
  catch { return respond(false, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body))
    return respond(false, 400);
  const input = body as Record<string, unknown>;
  if (Object.keys(input).length !== 2 || !("actorKey" in input) || !("request" in input))
    return respond(false, 400);
  try {
    const permitted = await attestCurrentTanstackSavedPreviewSource({
      actorKey: input.actorKey, request: input.request,
    });
    return respond(permitted, permitted ? 200 : 409);
  } catch {
    // DB outage and unexpected failures must never become authorization.
    return respond(false, 503);
  }
}
