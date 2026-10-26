import { isServiceAuthorized } from "@/lib/auth/buildHandoffProtocol";
import { revokeBuildHandoffSession } from "@/lib/auth/buildHandoffStore";
import { readLimitedHandoffJson } from "@/lib/auth/buildHandoffBody";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    if (!isServiceAuthorized(request.headers.get("authorization"))) return new Response(null, { status: 401 });
    if (Number(request.headers.get("content-length") || 0) > 512) return new Response(null, { status: 413 });
    const value = await readLimitedHandoffJson(request, 512);
    if (!value) return new Response(null, { status: 400 });
    await revokeBuildHandoffSession(typeof value.sessionHash === "string" ? value.sessionHash : "");
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch { return new Response(null, { status: 503 }); }
}
