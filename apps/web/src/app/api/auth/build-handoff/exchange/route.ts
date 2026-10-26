import { isServiceAuthorized } from "@/lib/auth/buildHandoffProtocol";
import { exchangeBuildHandoff } from "@/lib/auth/buildHandoffStore";
import { readLimitedHandoffJson } from "@/lib/auth/buildHandoffBody";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    if (!isServiceAuthorized(request.headers.get("authorization"))) return new Response(null, { status: 401 });
    if (Number(request.headers.get("content-length") || 0) > 2048) return new Response(null, { status: 413 });
    const value = await readLimitedHandoffJson(request);
    if (!value) return new Response(null, { status: 400 });
    const ok = await exchangeBuildHandoff({
      ticket: typeof value.ticket === "string" ? value.ticket : "",
      state: typeof value.state === "string" ? value.state : "",
      sessionHash: typeof value.sessionHash === "string" ? value.sessionHash : "",
    });
    return Response.json({ ok }, { status: ok ? 200 : 403, headers: { "Cache-Control": "no-store" } });
  } catch { return new Response(null, { status: 503 }); }
}
