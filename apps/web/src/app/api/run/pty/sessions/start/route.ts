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
    wsUrl: string;
}
    | {
    ok: false;
    error: string;
};

function isShellRequest(
    body: unknown,
): body is Extract<InteractiveRunReq, { kind: "shell" }> {
    return (
        !!body &&
        typeof body === "object" &&
        (body as { kind?: unknown }).kind === "shell"
    );
}

function getRunnerWsBase() {
    const explicit =
        process.env.RUNNER_WS_BASE_URL?.trim() ||
        process.env.NEXT_PUBLIC_RUNNER_WS_BASE_URL?.trim();

    if (explicit) {
        const normalized = explicit.replace(/\/+$/, "");
        if (!/^wss?:\/\//i.test(normalized)) {
            throw new Error(
                `RUNNER_WS_BASE_URL must start with ws:// or wss://. Got: ${normalized}`,
            );
        }
        return normalized;
    }

    const runnerBase = process.env.RUNNER_BASE_URL?.trim();
    if (runnerBase) {
        const normalized = runnerBase.replace(/\/+$/, "");
        if (/^https:\/\//i.test(normalized)) {
            return normalized.replace(/^https:/i, "wss:");
        }
        if (/^http:\/\//i.test(normalized)) {
            return normalized.replace(/^http:/i, "ws:");
        }
        throw new Error(
            `RUNNER_BASE_URL must start with http:// or https://. Got: ${normalized}`,
        );
    }

    throw new Error(
        "Missing RUNNER_WS_BASE_URL or RUNNER_BASE_URL",
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



        const runnerWsBase = getRunnerWsBase();
        const wsUrl =
            `${runnerWsBase}/sessions/${encodeURIComponent(out.sessionId)}/ws` +
            `?token=${encodeURIComponent(attachToken)}`;


        return NextResponse.json<StartBrowserSessionResult>({
            ok: true,
            sessionId: out.sessionId,
            state: out.state,
            attachToken,
            wsUrl,
        });
    } catch (e: any) {
        console.error("PTY start route failed", {
            message: e?.message,
            stack: e?.stack,
        });

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