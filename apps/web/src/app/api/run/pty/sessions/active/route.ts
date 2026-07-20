import { NextRequest, NextResponse } from "next/server";
import { requireRunnerActorKey } from "@/lib/server/runnerActorKey";
import {
    listPtyLeasesByActor,
    listPtyLeasesByHost,
    maxPtySessionsPerActor,
    normalizePtyIdentityKey,
} from "@/lib/server/ptySessionLeases";

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
        const [leases, hostLeases] = await Promise.all([
            listPtyLeasesByActor({ actorKey }),
            hostKey
                ? listPtyLeasesByHost({ actorKey, hostKey })
                : Promise.resolve([]),
        ]);

        return NextResponse.json<Result>({
            ok: true,
            activeCount: leases.length,
            maxActiveSessions: maxPtySessionsPerActor(),
            hostActiveOwnerKeys: hostLeases.map((lease) => lease.ownerKey),
        });
    } catch (error: any) {
        const status = error?.message === "Unauthorized" ? 401 : 500;
        return NextResponse.json<Result>(
            { ok: false, error: error?.message ?? "Failed." },
            { status },
        );
    }
}
