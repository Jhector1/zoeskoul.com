import { NextRequest, NextResponse } from "next/server";
import { requireRunnerActorKey } from "@/lib/server/runnerActorKey";
import { runnerPost } from "@/lib/server/runnerClient";
import {
    forgetPtyLeaseBySession,
    listPtyLeasesByHost,
    normalizePtyIdentityKey,
} from "@/lib/server/ptySessionLeases";

export const runtime = "nodejs";

type Result = { ok: true; canceled: number } | { ok: false; error: string };

export async function POST(req: NextRequest) {
    try {
        const actorKey = await requireRunnerActorKey();
        const body = (await req.json().catch(() => null)) as { hostKey?: unknown } | null;
        const hostKey = normalizePtyIdentityKey(body?.hostKey);

        if (!hostKey) {
            return NextResponse.json<Result>(
                { ok: false, error: "hostKey is required." },
                { status: 400 },
            );
        }

        const leases = await listPtyLeasesByHost({ actorKey, hostKey });

        await Promise.allSettled(
            leases.map(async (lease) => {
                await runnerPost<{ ok?: boolean }>(
                    `/sessions/${encodeURIComponent(lease.sessionId)}/cancel`,
                    actorKey,
                ).catch(() => null);
                await forgetPtyLeaseBySession({
                    actorKey,
                    sessionId: lease.sessionId,
                });
            }),
        );

        return NextResponse.json<Result>({ ok: true, canceled: leases.length });
    } catch (error: any) {
        const status = error?.message === "Unauthorized" ? 401 : 500;
        return NextResponse.json<Result>(
            { ok: false, error: error?.message ?? "Failed." },
            { status },
        );
    }
}
