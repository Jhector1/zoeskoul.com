import { NextRequest, NextResponse } from "next/server";
import { requireRunnerActorKey } from "@/lib/server/runnerActorKey";
import { runnerPost } from "@/lib/server/runnerClient";
import {
    readRunnerPtyCapacity,
    reconcilePtyLeasesWithRunner,
    runnerSessionsForHost,
} from "@/lib/server/runnerPtySessions";
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

        const targets = new Set<string>();

        try {
            const capacity = await readRunnerPtyCapacity(actorKey);
            await reconcilePtyLeasesWithRunner({ actorKey, capacity });
            for (const session of runnerSessionsForHost(capacity, hostKey)) {
                targets.add(session.sessionId);
            }
        } catch (error) {
            console.warn("PTY host heartbeat used lease fallback", {
                message: error instanceof Error ? error.message : String(error),
            });
        }

        // Preserve compatibility during rolling deploys and include any legacy
        // shell sessions that predate runner-side browser identity metadata.
        const leases = await listPtyLeasesByHost({ actorKey, hostKey });
        for (const lease of leases) targets.add(lease.sessionId);

        let touched = 0;
        for (const sessionId of targets) {
            try {
                await runnerPost<{ ok: true; state: string }>(
                    `/sessions/${encodeURIComponent(sessionId)}/heartbeat`,
                    actorKey,
                    {},
                );
                await touchPtyLeaseBySession({ actorKey, sessionId });
                touched += 1;
            } catch {
                await forgetPtyLeaseBySession({ actorKey, sessionId }).catch(() => {});
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
