import { NextRequest, NextResponse } from "next/server";
import { requireRunnerActorKey } from "@/lib/server/runnerActorKey";
import { runnerPost } from "@/lib/server/runnerClient";
import {
    readRunnerPtyCapacity,
    reconcilePtyLeasesWithRunner,
    runnerSessionsForOwner,
} from "@/lib/server/runnerPtySessions";
import {
    forgetPtyLeaseBySession,
    getPtyLeaseByOwner,
    normalizePtyIdentityKey,
} from "@/lib/server/ptySessionLeases";

export const runtime = "nodejs";

type Result = { ok: true; canceled: boolean } | { ok: false; error: string };

export async function POST(req: NextRequest) {
    try {
        const actorKey = await requireRunnerActorKey();
        const body = (await req.json().catch(() => null)) as { ownerKey?: unknown } | null;
        const ownerKey = normalizePtyIdentityKey(body?.ownerKey);

        if (!ownerKey) {
            return NextResponse.json<Result>(
                { ok: false, error: "ownerKey is required." },
                { status: 400 },
            );
        }

        const targets = new Set<string>();

        try {
            const capacity = await readRunnerPtyCapacity(actorKey);
            await reconcilePtyLeasesWithRunner({ actorKey, capacity });
            for (const session of runnerSessionsForOwner(capacity, ownerKey)) {
                targets.add(session.sessionId);
            }
        } catch (error) {
            console.warn("PTY owner cancel used lease fallback", {
                message: error instanceof Error ? error.message : String(error),
            });
        }

        const lease = await getPtyLeaseByOwner({ actorKey, ownerKey });
        if (lease) targets.add(lease.sessionId);

        await Promise.allSettled(
            [...targets].map(async (sessionId) => {
                await runnerPost<{ ok?: boolean }>(
                    `/sessions/${encodeURIComponent(sessionId)}/cancel`,
                    actorKey,
                ).catch(() => null);
                await forgetPtyLeaseBySession({ actorKey, sessionId });
            }),
        );

        return NextResponse.json<Result>({
            ok: true,
            canceled: targets.size > 0,
        });
    } catch (error: any) {
        const status = error?.message === "Unauthorized" ? 401 : 500;
        return NextResponse.json<Result>(
            { ok: false, error: error?.message ?? "Failed." },
            { status },
        );
    }
}
