import { NextRequest, NextResponse } from "next/server";
import { requireRunnerActorKey } from "@/lib/server/runnerActorKey";
import {
    readRunnerPtyCapacity,
    reconcilePtyLeasesWithRunner,
    runnerSessionsForHost,
} from "@/lib/server/runnerPtySessions";
import { normalizePtyIdentityKey } from "@/lib/server/ptySessionLeases";

export const runtime = "nodejs";

type Result =
    | {
          ok: true;
          activeCount: number;
          maxActiveSessions: number;
          hostActiveOwnerKeys: string[];
      }
    | { ok: false; error: string };

export async function GET(req: NextRequest) {
    try {
        const actorKey = await requireRunnerActorKey();
        const hostKey = normalizePtyIdentityKey(
            req.nextUrl.searchParams.get("hostKey"),
        );
        const capacity = await readRunnerPtyCapacity(actorKey);

        // Capacity must still work if Redis is temporarily unavailable. The
        // runner registry is the source of truth; lease repair is best effort.
        await reconcilePtyLeasesWithRunner({ actorKey, capacity }).catch((error) => {
            console.warn("PTY lease reconciliation skipped", {
                message: error instanceof Error ? error.message : String(error),
            });
        });

        const hostActiveOwnerKeys = hostKey
            ? runnerSessionsForHost(capacity, hostKey)
                  .map((session) => session.clientOwnerKey)
                  .filter((value): value is string => Boolean(value))
            : [];

        return NextResponse.json<Result>({
            ok: true,
            activeCount: capacity.activeCount,
            maxActiveSessions: capacity.maxActiveSessions,
            hostActiveOwnerKeys: [...new Set(hostActiveOwnerKeys)],
        });
    } catch (error: any) {
        const status = error?.message === "Unauthorized" ? 401 : 500;
        return NextResponse.json<Result>(
            { ok: false, error: error?.message ?? "Failed." },
            { status },
        );
    }
}
