import { NextRequest, NextResponse } from "next/server";
import { requireRunnerActorKey } from "@/lib/server/runnerActorKey";
import { runnerPost } from "@/lib/server/runnerClient";
import {
    forgetPtyLeaseBySession,
    listPtyLeasesByHost,
    normalizePtyIdentityKey,
    touchPtyLeaseBySession,
} from "@/lib/server/ptySessionLeases";

export const runtime = "nodejs";

type Result = { ok: true; touched: number } | { ok: false; error: string };

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
        let touched = 0;

        for (const lease of leases) {
            try {
                await runnerPost<{ ok: true; state: string }>(
                    `/sessions/${encodeURIComponent(lease.sessionId)}/heartbeat`,
                    actorKey,
                    {},
                );
                await touchPtyLeaseBySession({
                    actorKey,
                    sessionId: lease.sessionId,
                });
                touched += 1;
            } catch {
                await forgetPtyLeaseBySession({
                    actorKey,
                    sessionId: lease.sessionId,
                }).catch(() => {});
            }
        }

        return NextResponse.json<Result>({ ok: true, touched });
    } catch (error: any) {
        const status = error?.message === "Unauthorized" ? 401 : 500;
        return NextResponse.json<Result>(
            { ok: false, error: error?.message ?? "Failed." },
            { status },
        );
    }
}
