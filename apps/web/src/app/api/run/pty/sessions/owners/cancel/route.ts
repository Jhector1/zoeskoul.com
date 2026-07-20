import { NextRequest, NextResponse } from "next/server";
import { requireRunnerActorKey } from "@/lib/server/runnerActorKey";
import { runnerPost } from "@/lib/server/runnerClient";
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

        const lease = await getPtyLeaseByOwner({ actorKey, ownerKey });
        if (!lease) {
            return NextResponse.json<Result>({ ok: true, canceled: false });
        }

        await runnerPost<{ ok?: boolean }>(
            `/sessions/${encodeURIComponent(lease.sessionId)}/cancel`,
            actorKey,
        ).catch(() => null);
        await forgetPtyLeaseBySession({ actorKey, sessionId: lease.sessionId });

        return NextResponse.json<Result>({ ok: true, canceled: true });
    } catch (error: any) {
        const status = error?.message === "Unauthorized" ? 401 : 500;
        return NextResponse.json<Result>(
            { ok: false, error: error?.message ?? "Failed." },
            { status },
        );
    }
}
