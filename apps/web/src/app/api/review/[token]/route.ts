import { NextResponse } from "next/server";
import { pollRun } from "@/lib/code/runCode";
import { parseRunToken } from "@/lib/code/api/parseRunReq";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonNoStore(body: unknown, status: number) {
    return NextResponse.json(body, {
        status,
        headers: {
            "Cache-Control": "no-store, max-age=0",
        },
    });
}

export async function GET(
    _req: Request,
    ctx: { params: Promise<{ token: string }> },
) {
    try {
        const { token: rawToken } = await ctx.params;
        const token = parseRunToken(rawToken);

        const out = await pollRun(token);

        const status =
            out.status === "Error"
                ? 502
                : 200;

        return jsonNoStore(out, status);
    } catch (e: any) {
        const message = e?.message ?? "Poll failed";
        const badRequest = /Invalid run token/i.test(message);

        console.error("[/api/run/[token]] failed:", e);

        return jsonNoStore(
            {
                ok: false,
                done: true,
                status: "Error",
                error: message,
            },
            badRequest ? 400 : 500,
        );
    }
}