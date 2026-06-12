import { NextRequest, NextResponse } from "next/server";
import { requireRunnerActorKey } from "@/lib/server/runnerActorKey";
import { runnerPost, RunnerHttpError } from "@/lib/server/runnerClient";

type CancelSessionResponse =
    | { ok: true }
    | { ok: false; error: string };

export async function POST(
    _req: NextRequest,
    { params }: { params: Promise<{ sessionId: string }> },
) {
    try {
        const actorKey = await requireRunnerActorKey();
        const { sessionId } = await params;

        const out = await runnerPost<CancelSessionResponse>(
            `/sessions/${encodeURIComponent(sessionId)}/cancel`,
            actorKey,
        );

        if (!out.ok) {
            return NextResponse.json<CancelSessionResponse>(out, { status: 400 });
        }

        return NextResponse.json<CancelSessionResponse>({ ok: true });
    } catch (e: any) {
        if (e instanceof RunnerHttpError) {
            return NextResponse.json<CancelSessionResponse>(
                { ok: false, error: e.message },
                { status: e.status },
            );
        }

        const status = e?.message === "Unauthorized" ? 401 : 500;
        return NextResponse.json<CancelSessionResponse>(
            { ok: false, error: e?.message ?? "Failed." },
            { status },
        );
    }
}
