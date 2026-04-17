import { NextRequest, NextResponse } from "next/server";
import type {
    InteractiveRunReq,
    RunSessionState,
    StartSessionResult,
} from "@zoeskoul/code-contracts";
import { getActor } from "@/lib/practice/actor";
import { requireRunnerActorKey } from "@/lib/server/runnerActorKey";
import { runnerPost, RunnerHttpError } from "@/lib/server/runnerClient";
import { createAttachToken } from "@/lib/server/ptyAttachToken";

type StartBrowserSessionResult =
    | {
    ok: true;
    sessionId: string;
    state: RunSessionState;
    attachToken: string;
}
    | {
    ok: false;
    error: string;
};

function isShellRequest(body: unknown): body is Extract<InteractiveRunReq, { kind: "shell" }> {
    return (
        !!body &&
        typeof body === "object" &&
        (body as { kind?: unknown }).kind === "shell"
    );
}

export async function POST(req: NextRequest) {
    try {
        const actor = await getActor();
        const body = (await req.json()) as InteractiveRunReq;

        if (isShellRequest(body) && !actor.userId) {
            return NextResponse.json<StartBrowserSessionResult>(
                { ok: false, error: "Sign in required for Shell Practice." },
                { status: 401 },
            );
        }

        const actorKey = await requireRunnerActorKey();

        const out = await runnerPost<StartSessionResult>(
            "/sessions/start",
            actorKey,
            body,
        );

        if (!out.ok) {
            return NextResponse.json<StartBrowserSessionResult>(out, { status: 400 });
        }

        const attachToken = createAttachToken({
            sessionId: out.sessionId,
            actorKey,
        });

        return NextResponse.json<StartBrowserSessionResult>({
            ok: true,
            sessionId: out.sessionId,
            state: out.state,
            attachToken,
        });
    } catch (e: any) {
        if (e instanceof RunnerHttpError) {
            return NextResponse.json<StartBrowserSessionResult>(
                { ok: false, error: e.message },
                { status: e.status },
            );
        }

        const status = e?.message === "Unauthorized" ? 401 : 500;
        return NextResponse.json<StartBrowserSessionResult>(
            { ok: false, error: e?.message ?? "Failed." },
            { status },
        );
    }
}