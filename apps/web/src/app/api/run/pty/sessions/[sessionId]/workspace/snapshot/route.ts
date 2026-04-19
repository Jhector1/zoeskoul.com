import { requireRunnerActorKey } from "@/lib/server/runnerActorKey";
import { runnerPost, RunnerHttpError } from "@/lib/server/runnerClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SnapshotWorkspaceResponse =
    | {
    ok: true;
    files: Array<{ path: string; content: string }>;
}
    | {
    ok: false;
    error: string;
};

function jsonNoStore(body: unknown, status = 200) {
    return Response.json(body, {
        status,
        headers: {
            "Cache-Control": "no-store",
        },
    });
}

export async function POST(
    _req: Request,
    ctx: { params: Promise<{ sessionId: string }> },
) {
    try {
        const { sessionId } = await ctx.params;
        const actorKey = await requireRunnerActorKey();

        const out = await runnerPost<SnapshotWorkspaceResponse>(
            `/sessions/${encodeURIComponent(sessionId)}/snapshot-workspace`,
            actorKey,
            {},
        );

        return jsonNoStore(out, out.ok ? 200 : 400);
    } catch (e: any) {
        if (e instanceof RunnerHttpError) {
            return jsonNoStore({ ok: false, error: e.message }, e.status);
        }

        return jsonNoStore(
            { ok: false, error: e?.message ?? "Failed to snapshot workspace." },
            400,
        );
    }
}