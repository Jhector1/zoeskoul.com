import { NextResponse } from "next/server";
import { requireRunnerActorKey } from "@/lib/server/runnerActorKey";
import {
    listPtyLeasesByActor,
    maxPtySessionsPerActor,
} from "@/lib/server/ptySessionLeases";

export const runtime = "nodejs";

type Result =
    | { ok: true; activeCount: number; maxActiveSessions: number }
    | { ok: false; error: string };

export async function GET() {
    try {
        const actorKey = await requireRunnerActorKey();
        const leases = await listPtyLeasesByActor({ actorKey });

        return NextResponse.json<Result>({
            ok: true,
            activeCount: leases.length,
            maxActiveSessions: maxPtySessionsPerActor(),
        });
    } catch (error: any) {
        const status = error?.message === "Unauthorized" ? 401 : 500;
        return NextResponse.json<Result>(
            { ok: false, error: error?.message ?? "Failed." },
            { status },
        );
    }
}
