import { NextRequest, NextResponse } from "next/server";
import { requireRunnerActorKey } from "@/lib/server/runnerActorKey";
import { RunnerHttpError, runnerPost } from "@/lib/server/runnerClient";
import { forgetPtyLeaseBySession } from "@/lib/server/ptySessionLeases";

export const runtime = "nodejs";

type CancelSessionResponse =
    | { ok: true }
    | { ok: false; error: string };

export async function POST(
    _req: NextRequest,
    { params }: { params: Promise<{ sessionId: string }> },
) {
    const { sessionId } = await params;
    let actorKey: string | null = null;

    try {
        actorKey = await requireRunnerActorKey();

        const out = await runnerPost<CancelSessionResponse>(
            `/sessions/${encodeURIComponent(sessionId)}/cancel`,
            actorKey,
        );

        await forgetPtyLeaseBySession({
            actorKey,
            sessionId,
        }).catch(() => {});

        if (!out.ok) {
            return NextResponse.json<CancelSessionResponse>(out, {
                status: 400,
            });
        }

        return NextResponse.json<CancelSessionResponse>({ ok: true });
    } catch (e: any) {
        if (actorKey) {
            await forgetPtyLeaseBySession({
                actorKey,
                sessionId,
            }).catch(() => {});
        }

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