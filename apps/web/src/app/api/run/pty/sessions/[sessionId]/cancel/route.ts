import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
    _req: Request,
    ctx: { params: Promise<{ sessionId: string }> },
) {
    const { sessionId } = await ctx.params;

    const res = await fetch(`${process.env.RUNNER_BASE_URL}/sessions/${sessionId}/cancel`, {
        method: "POST",
    });

    const text = await res.text();

    return new NextResponse(text, {
        status: res.status,
        headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
        },
    });
}