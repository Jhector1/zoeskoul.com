import { isServiceAuthorized } from "@/lib/auth/buildHandoffProtocol";
import { EMPTY_BUILD_SESSION, renewBuildHandoffSession } from "@/lib/auth/buildHandoffStore";
import { readLimitedHandoffJson } from "@/lib/auth/buildHandoffBody";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

/** Server-to-server only: ZoeBuild cannot mint, refresh or read Web identity locally. */
export async function POST(request: Request) {
  try {
    if (!isServiceAuthorized(request.headers.get("authorization")))
      return new Response(null, { status: 401, headers });
    if (Number(request.headers.get("content-length") || 0) > 512)
      return new Response(null, { status: 413, headers });
    const value = await readLimitedHandoffJson(request, 512);
    if (!value) return new Response(null, { status: 400, headers });
    const session = await renewBuildHandoffSession(
      typeof value.sessionHash === "string" ? value.sessionHash : "",
    );
    return Response.json(session, { headers });
  } catch {
    return Response.json(EMPTY_BUILD_SESSION, { status: 503, headers });
  }
}
