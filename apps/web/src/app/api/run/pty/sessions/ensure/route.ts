import { NextRequest, NextResponse } from "next/server";
import type {
    InteractiveRunReq,
    RunSessionState,
    StartSessionResult,
} from "@zoeskoul/code-contracts";
import { createAttachToken } from "@/lib/server/ptyAttachToken";
import { requireRunnerActorKey } from "@/lib/server/runnerActorKey";
import { RunnerHttpError, runnerPost } from "@/lib/server/runnerClient";
import {
    readRunnerPtyCapacity,
    reconcilePtyLeasesWithRunner,
} from "@/lib/server/runnerPtySessions";
import {
    listPtyLeasesByActor,
    maxPtySessionsPerActor,
    normalizePtyIdentityKey,
    normalizeWorkspaceKey,
    rememberPtyLease,
} from "@/lib/server/ptySessionLeases";
import {
    isRedisUnavailableError,
    redisUnavailableMessage,
} from "@/lib/server/redis";

export const runtime = "nodejs";

type WorkspaceSyncEntry =
    | { kind?: "file"; path: string; content: string }
    | { kind: "directory"; path: string };

type ShellEnsureReq = Extract<InteractiveRunReq, { kind: "shell" }> & {
    files?: WorkspaceSyncEntry[];
    workspaceKey?: string;
    leaseKey?: string;
    hostKey?: string;
    ownerKey?: string;
    forceNew?: boolean;
};

type EnsureBrowserSessionResult =
    | {
          ok: true;
          sessionId: string;
          state: RunSessionState;
          attachToken: string;
          wsUrl: string;
          reused: boolean;
          activeCount: number;
          maxActiveSessions: number;
      }
    | {
          ok: false;
          error: string;
      };

function isShellRequest(body: unknown): body is ShellEnsureReq {
    if (!body || typeof body !== "object") return false;
    return (body as { kind?: unknown }).kind === "shell";
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

    const runnerBase =
        process.env.RUNNER_BASE_URL?.trim() || process.env.RUNNER_URL?.trim();

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

    throw new Error("Missing RUNNER_WS_BASE_URL or RUNNER_BASE_URL");
}

function buildWsUrl(sessionId: string, attachToken: string) {
    const runnerWsBase = getRunnerWsBase();

    return (
        `${runnerWsBase}/sessions/${encodeURIComponent(sessionId)}/ws` +
        `?token=${encodeURIComponent(attachToken)}`
    );
}

async function buildSessionResponse(args: {
    sessionId: string;
    state: RunSessionState;
    actorKey: string;
    reused: boolean;
    capacityHint?: {
        activeCount?: number;
        maxActiveSessions?: number;
    };
}): Promise<EnsureBrowserSessionResult> {
    const attachToken = createAttachToken({
        sessionId: args.sessionId,
        actorKey: args.actorKey,
    });
    const hintedActiveCount = Number(args.capacityHint?.activeCount);
    const hintedMaxActiveSessions = Number(args.capacityHint?.maxActiveSessions);
    let activeCount: number;
    let maxActiveSessions: number;

    if (
        Number.isFinite(hintedActiveCount) &&
        hintedActiveCount >= 0 &&
        Number.isFinite(hintedMaxActiveSessions) &&
        hintedMaxActiveSessions >= 1
    ) {
        /**
         * /sessions/start already registered the session and returned the
         * runner-authoritative count. Do not add another runner round trip to the
         * prompt-critical path merely to reread the same capacity.
         */
        activeCount = Math.floor(hintedActiveCount);
        maxActiveSessions = Math.floor(hintedMaxActiveSessions);
    } else {
        try {
            const capacity = await readRunnerPtyCapacity(args.actorKey);
            activeCount = capacity.activeCount;
            maxActiveSessions = capacity.maxActiveSessions;
            await reconcilePtyLeasesWithRunner({
                actorKey: args.actorKey,
                capacity,
            }).catch(() => {});
        } catch {
            // Keep an already-created terminal usable during a rolling deploy where
            // the new capacity route has not reached every runner yet.
            activeCount = (await listPtyLeasesByActor({ actorKey: args.actorKey })).length;
            maxActiveSessions = maxPtySessionsPerActor();
        }
    }

    return {
        ok: true,
        sessionId: args.sessionId,
        state: args.state,
        attachToken,
        wsUrl: buildWsUrl(args.sessionId, attachToken),
        reused: args.reused,
        activeCount,
        maxActiveSessions,
    };
}

function stripLeaseFields(
    body: ShellEnsureReq,
    metadata?: {
        runnerWorkspaceKey?: string;
        hostKey?: string;
        ownerKey?: string;
        workspaceKey?: string;
    },
): InteractiveRunReq {
    const {
        workspaceKey: _workspaceKey,
        leaseKey: _leaseKey,
        hostKey: _hostKey,
        ownerKey: _ownerKey,
        ...runnerBody
    } = body as any;

    return {
        ...runnerBody,
        ...(metadata?.runnerWorkspaceKey
            ? { workspaceKey: metadata.runnerWorkspaceKey }
            : {}),
        ...(metadata?.hostKey ? { clientHostKey: metadata.hostKey } : {}),
        ...(metadata?.ownerKey ? { clientOwnerKey: metadata.ownerKey } : {}),
        ...(metadata?.workspaceKey
            ? { clientWorkspaceKey: metadata.workspaceKey }
            : {}),
    } as InteractiveRunReq;
}

function buildRunnerWorkspaceKey(args: {
    hostKey: string;
    workspaceKey: string;
}) {
    return `${args.hostKey}::workspace::${args.workspaceKey}`;
}

export async function POST(req: NextRequest) {
    try {
        const actorKey = await requireRunnerActorKey();
        const body = (await req.json()) as InteractiveRunReq | ShellEnsureReq;

        if (!isShellRequest(body)) {
            const out = await runnerPost<StartSessionResult>(
                "/sessions/start",
                actorKey,
                body,
            );

            if (!out.ok) {
                return NextResponse.json<EnsureBrowserSessionResult>(out, {
                    status: 400,
                });
            }

            return NextResponse.json<EnsureBrowserSessionResult>(
                await buildSessionResponse({
                    sessionId: out.sessionId,
                    state: out.state,
                    actorKey,
                    reused: false,
                    capacityHint: out,
                }),
            );
        }

        const workspaceKey = normalizeWorkspaceKey(body.workspaceKey ?? body.leaseKey);

        if (!workspaceKey) {
            const out = await runnerPost<StartSessionResult>(
                "/sessions/start",
                actorKey,
                stripLeaseFields(body),
            );

            if (!out.ok) {
                return NextResponse.json<EnsureBrowserSessionResult>(out, {
                    status: 400,
                });
            }

            return NextResponse.json<EnsureBrowserSessionResult>(
                await buildSessionResponse({
                    sessionId: out.sessionId,
                    state: out.state,
                    actorKey,
                    reused: false,
                    capacityHint: out,
                }),
            );
        }

        const hostKey =
            normalizePtyIdentityKey(body.hostKey) ?? `legacy-host:${workspaceKey}`;
        const ownerKey =
            normalizePtyIdentityKey(body.ownerKey) ?? `legacy-owner:${workspaceKey}`;
        const runnerWorkspaceKey = buildRunnerWorkspaceKey({
            hostKey,
            workspaceKey,
        });

        const out = await runnerPost<StartSessionResult>(
            "/sessions/start",
            actorKey,
            stripLeaseFields(body, {
                runnerWorkspaceKey,
                hostKey,
                ownerKey,
                workspaceKey,
            }),
        );

        if (!out.ok) {
            return NextResponse.json<EnsureBrowserSessionResult>(out, {
                status: 400,
            });
        }

        await rememberPtyLease({
            actorKey,
            hostKey,
            ownerKey,
            workspaceKey,
            sessionId: out.sessionId,
            state: out.state,
        });

        return NextResponse.json<EnsureBrowserSessionResult>(
            await buildSessionResponse({
                sessionId: out.sessionId,
                state: out.state,
                actorKey,
                reused: out.reused === true,
                capacityHint: out,
            }),
        );
    } catch (e: any) {
        console.error("PTY ensure route failed", {
            message: e?.message,
            stack: e?.stack,
        });

        if (isRedisUnavailableError(e)) {
            return NextResponse.json<EnsureBrowserSessionResult>(
                {
                    ok: false,
                    error: redisUnavailableMessage(e),
                },
                { status: 503 },
            );
        }

        if (e instanceof RunnerHttpError) {
            return NextResponse.json<EnsureBrowserSessionResult>(
                { ok: false, error: e.message },
                { status: e.status },
            );
        }

        const status = e?.message === "Unauthorized" ? 401 : 500;

        return NextResponse.json<EnsureBrowserSessionResult>(
            { ok: false, error: e?.message ?? "Failed." },
            { status },
        );
    }
}
