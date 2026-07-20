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

        const targets = new Set<string>();

        try {
            const capacity = await readRunnerPtyCapacity(actorKey);
            await reconcilePtyLeasesWithRunner({ actorKey, capacity });
            for (const session of runnerSessionsForHost(capacity, hostKey)) {
                targets.add(session.sessionId);
            }
        } catch (error) {
            console.warn("PTY host cancel used lease fallback", {
                message: error instanceof Error ? error.message : String(error),
            });
        }

        const leases = await listPtyLeasesByHost({ actorKey, hostKey });
        for (const lease of leases) targets.add(lease.sessionId);

        await Promise.allSettled(
            [...targets].map(async (sessionId) => {
                await runnerPost<{ ok?: boolean }>(
                    `/sessions/${encodeURIComponent(sessionId)}/cancel`,
                    actorKey,
                ).catch(() => null);
                await forgetPtyLeaseBySession({ actorKey, sessionId });
            }),
        );

        return NextResponse.json<Result>({ ok: true, canceled: targets.size });
    } catch (error: any) {
        const status = error?.message === "Unauthorized" ? 401 : 500;
        return NextResponse.json<Result>(
            { ok: false, error: error?.message ?? "Failed." },
            { status },
        );
    }
}
