import { NextRequest, NextResponse } from "next/server";
import { requireRunnerActorKey } from "@/lib/server/runnerActorKey";
import { touchPtyLeaseBySession } from "@/lib/server/ptySessionLeases";

export const runtime = "nodejs";

type HeartbeatResult =
    | { ok: true; found: boolean }
    | { ok: false; error: string };

export async function POST(req: NextRequest) {
    try {
        const actorKey = await requireRunnerActorKey();

        const body = (await req.json().catch(() => null)) as {
            sessionId?: unknown;
        } | null;

        const sessionId =
            typeof body?.sessionId === "string" ? body.sessionId.trim() : "";

        if (!sessionId) {
            return NextResponse.json<HeartbeatResult>(
                { ok: false, error: "sessionId is required." },
                { status: 400 },
            );
        }

        const found = await touchPtyLeaseBySession({
            actorKey,
            sessionId,
        });

        return NextResponse.json<HeartbeatResult>({
            ok: true,
            found,
        });
    } catch (e: any) {
        const status = e?.message === "Unauthorized" ? 401 : 500;

        return NextResponse.json<HeartbeatResult>(
            { ok: false, error: e?.message ?? "Failed." },
            { status },
        );
    }
}