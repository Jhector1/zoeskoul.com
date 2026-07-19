import { requireRunnerActorKey } from "@/lib/server/runnerActorKey";
import { runnerPost, RunnerHttpError } from "@/lib/server/runnerClient";
import { forgetPtyLeaseBySession } from "@/lib/server/ptySessionLeases";
import type { WorkspaceSyncEntry } from "@zoeskoul/code-contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SnapshotWorkspaceResponse =
    | {
    ok: true;
    files: WorkspaceSyncEntry[];
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

function isStaleRunnerSessionError(error: RunnerHttpError) {
    const message = error.message.toLowerCase();

    return (
        error.status === 403 ||
        error.status === 404 ||
        message.includes("no such container") ||
        message.includes("no such session") ||
        message.includes("session not found") ||
        message.includes("forbidden")
    );
}

export async function POST(
    _req: Request,
    ctx: { params: Promise<{ sessionId: string }> },
) {
    const { sessionId } = await ctx.params;
    let actorKey: string | null = null;

    try {
        actorKey = await requireRunnerActorKey();

        const out = await runnerPost<SnapshotWorkspaceResponse>(
            `/sessions/${encodeURIComponent(sessionId)}/snapshot-workspace`,
            actorKey,
            {},
        );

        return jsonNoStore(out, out.ok ? 200 : 400);
    } catch (e: any) {
        if (e instanceof RunnerHttpError) {
            if (actorKey && isStaleRunnerSessionError(e)) {
                await forgetPtyLeaseBySession({ actorKey, sessionId }).catch(() => {});
            }

            return jsonNoStore({ ok: false, error: e.message }, e.status);
        }

        return jsonNoStore(
            { ok: false, error: e?.message ?? "Failed to snapshot workspace." },
            400,
        );
    }
}
