import { NextResponse } from "next/server";
import { getSession } from "@/lib/code/sessions/sessionStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
    _req: Request,
    ctx: { params: Promise<{ sessionId: string }> },
) {
    const { sessionId } = await ctx.params;
    const session = getSession(sessionId);

    if (!session) {
        return NextResponse.json(
            { ok: false, error: "Session not found." },
            { status: 404, headers: { "Cache-Control": "no-store, max-age=0" } },
        );
    }

    return NextResponse.json(
        {
            ok: true,
            session: {
                id: session.id,
                state: session.state,
                language: session.language,
                createdAt: session.createdAt,
                updatedAt: session.updatedAt,
                exitCode: session.exitCode,
                compileExitCode: session.compileExitCode,
            },
        },
        { status: 200, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
}