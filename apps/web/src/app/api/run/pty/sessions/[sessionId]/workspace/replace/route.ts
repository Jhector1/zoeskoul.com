import { requireRunnerActorKey } from "@/lib/server/runnerActorKey";
import { runnerPost, RunnerHttpError } from "@/lib/server/runnerClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type WorkspaceSyncEntry =
    | { kind?: "file"; path: string; content: string }
    | { kind: "directory"; path: string };

type ReplaceWorkspaceRequest = {
    files: WorkspaceSyncEntry[];
};

type ReplaceWorkspaceResponse =
    | {
    ok: true;
    fileCount: number;
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
    req: Request,
    ctx: { params: Promise<{ sessionId: string }> },
) {
    try {
        const { sessionId } = await ctx.params;
        const body = (await req.json()) as Partial<ReplaceWorkspaceRequest>;

        const files = Array.isArray(body.files) ? body.files : [];
        const actorKey = await requireRunnerActorKey();

        const out = await runnerPost<ReplaceWorkspaceResponse>(
            `/sessions/${encodeURIComponent(sessionId)}/replace-workspace`,
            actorKey,
            { files },
        );

        return jsonNoStore(out, out.ok ? 200 : 400);
    } catch (e: any) {
        if (e instanceof RunnerHttpError) {
            return jsonNoStore({ ok: false, error: e.message }, e.status);
        }

        return jsonNoStore(
            { ok: false, error: e?.message ?? "Failed to replace workspace." },
            400,
        );
    }
}