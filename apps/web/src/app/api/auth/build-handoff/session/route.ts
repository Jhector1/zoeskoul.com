import { isServiceAuthorized } from "@/lib/auth/buildHandoffProtocol";
import { EMPTY_BUILD_SESSION, readBuildHandoffSession } from "@/lib/auth/buildHandoffStore";
import { readLimitedHandoffJson } from "@/lib/auth/buildHandoffBody";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    if (!isServiceAuthorized(request.headers.get("authorization"))) return new Response(null, { status: 401 });
    if (Number(request.headers.get("content-length") || 0) > 512) return new Response(null, { status: 413 });
    const value = await readLimitedHandoffJson(request, 512);
    if (!value) return new Response(null, { status: 400 });
    return Response.json(await readBuildHandoffSession(typeof value.sessionHash === "string" ? value.sessionHash : ""), { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json(EMPTY_BUILD_SESSION, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
