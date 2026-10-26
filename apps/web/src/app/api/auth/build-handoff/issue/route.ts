import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUserAccess } from "@/lib/access/currentUserAccess";
import { handoffBuilderOrigin, handoffServiceSecret, isSha256, safeBuilderPath } from "@/lib/auth/buildHandoffProtocol";
import { issueBuildHandoff } from "@/lib/auth/buildHandoffStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const access = await getCurrentUserAccess();
  if (!access.authenticated || !access.user) return new Response("Unauthorized", { status: 401, headers: { "Cache-Control": "no-store" } });
  const state = request.nextUrl.searchParams.get("state");
  if (!isSha256(state)) return new Response("Invalid state", { status: 400 });
  try {
    handoffServiceSecret(); // fail closed when service authentication is not configured
    const ticket = await issueBuildHandoff({ userId: access.user.id, state });
    const callback = new URL("/api/auth/handoff/callback", handoffBuilderOrigin());
    callback.searchParams.set("ticket", ticket);
    callback.searchParams.set("state", state);
    callback.searchParams.set("returnTo", safeBuilderPath(request.nextUrl.searchParams.get("returnTo")));
    const response = NextResponse.redirect(callback, 303);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch {
    return new Response("Handoff service unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
