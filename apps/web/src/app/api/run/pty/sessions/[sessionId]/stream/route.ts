export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
    _req: Request,
    ctx: { params: Promise<{ sessionId: string }> },
) {
    const { sessionId } = await ctx.params;

    const res = await fetch(`${process.env.RUNNER_BASE_URL}/sessions/${sessionId}/stream`, {
        method: "GET",
        headers: {
            Accept: "text/event-stream",
        },
    });


    return new Response(res.body, {
        status: res.status,
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-store, no-transform",
            Connection: "keep-alive",
        },
    });
}