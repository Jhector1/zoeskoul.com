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
    acquirePtyLeaseLock,
    forgetPtyLeaseBySession,
    getPtyLeaseByWorkspace,
    listPtyLeasesByActor,
    normalizeWorkspaceKey,
    releasePtyLeaseLock,
    rememberPtyLease,
    waitForPtyLeaseByWorkspace,
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
      }
    | {
          ok: false;
          error: string;
      };

type CancelSessionResponse = { ok: true } | { ok: false; error: string };

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

function buildSessionResponse(args: {
    sessionId: string;
    state: RunSessionState;
    actorKey: string;
    reused: boolean;
}): EnsureBrowserSessionResult {
    const attachToken = createAttachToken({
        sessionId: args.sessionId,
        actorKey: args.actorKey,
    });

    return {
        ok: true,
        sessionId: args.sessionId,
        state: args.state,
        attachToken,
        wsUrl: buildWsUrl(args.sessionId, attachToken),
        reused: args.reused,
    };
}

function stripLeaseFields(body: ShellEnsureReq): InteractiveRunReq {
    const {
        // workspaceKey: _workspaceKey,
        leaseKey: _leaseKey,
        forceNew: _forceNew,
        ...runnerBody
    } = body as any;

    return runnerBody as InteractiveRunReq;
}

function isStaleRunnerSessionError(error: unknown) {
    if (error instanceof RunnerHttpError) {
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

    const message =
        error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

    return (
        message.includes("no such container") ||
        message.includes("no such session") ||
        message.includes("session not found") ||
        message.includes("forbidden")
    );
}

function isTooManyActiveSessionsError(error: unknown) {
    const message =
        error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

    return message.includes("too many active sessions");
}

async function canReusePtyLease(args: {
    actorKey: string;
    sessionId: string;
}) {
    try {
        const out = await runnerPost<{ ok?: boolean }>(
            `/sessions/${encodeURIComponent(args.sessionId)}/snapshot-workspace`,
            args.actorKey,
            {},
        );

        return out?.ok !== false;
    } catch (error) {
        if (isStaleRunnerSessionError(error)) {
            await forgetPtyLeaseBySession({
                actorKey: args.actorKey,
                sessionId: args.sessionId,
            }).catch(() => {});

            console.warn("PTY ensure dropped stale lease", {
                sessionId: args.sessionId,
                message: error instanceof Error ? error.message : String(error),
            });

            return false;
        }

        throw error;
    }
}

async function reusableLeaseOrNull<T extends { sessionId: string }>(args: {
    actorKey: string;
    lease: T | null;
}) {
    if (!args.lease) return null;

    const reusable = await canReusePtyLease({
        actorKey: args.actorKey,
        sessionId: args.lease.sessionId,
    });

    return reusable ? args.lease : null;
}

async function cancelOtherActorShellLeases(args: {
    actorKey: string;
    workspaceKey: string;
}) {
    const leases = await listPtyLeasesByActor({ actorKey: args.actorKey });

    await Promise.allSettled(
        leases
            .filter((lease) => lease.workspaceKey !== args.workspaceKey)
            .map(async (lease) => {
                try {
                    await runnerPost<CancelSessionResponse>(
                        `/sessions/${encodeURIComponent(lease.sessionId)}/cancel`,
                        args.actorKey,
                    );
                } catch (error) {
                    if (!isStaleRunnerSessionError(error)) {
                        console.warn("Failed to cancel older PTY session", {
                            sessionId: lease.sessionId,
                            message:
                                error instanceof Error ? error.message : String(error),
                        });
                    }
                } finally {
                    await forgetPtyLeaseBySession({
                        actorKey: args.actorKey,
                        sessionId: lease.sessionId,
                    }).catch(() => {});
                }
            }),
    );
}

async function startRunnerSessionWithOneCleanupRetry(args: {
    actorKey: string;
    workspaceKey: string;
    body: ShellEnsureReq;
}) {
    const runnerBody = stripLeaseFields(args.body);

    try {
        return await runnerPost<StartSessionResult>(
            "/sessions/start",
            args.actorKey,
            runnerBody,
        );
    } catch (error) {
        if (!isTooManyActiveSessionsError(error)) {
            throw error;
        }

        await cancelOtherActorShellLeases({
            actorKey: args.actorKey,
            workspaceKey: args.workspaceKey,
        });

        await new Promise((resolve) => setTimeout(resolve, 300));

        return await runnerPost<StartSessionResult>(
            "/sessions/start",
            args.actorKey,
            runnerBody,
        );
    }
}

export async function POST(req: NextRequest) {
    let lock: { key: string; token: string } | null = null;

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
                buildSessionResponse({
                    sessionId: out.sessionId,
                    state: out.state,
                    actorKey,
                    reused: false,
                }),
            );
        }

        const workspaceKey = normalizeWorkspaceKey(
            body.workspaceKey ?? body.leaseKey,
        );

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
                buildSessionResponse({
                    sessionId: out.sessionId,
                    state: out.state,
                    actorKey,
                    reused: false,
                }),
            );
        }

        if (!body.forceNew) {
            const existing = await getPtyLeaseByWorkspace({ actorKey, workspaceKey });
            const reusable = await reusableLeaseOrNull({ actorKey, lease: existing });

            if (reusable) {
                return NextResponse.json<EnsureBrowserSessionResult>(
                    buildSessionResponse({
                        sessionId: reusable.sessionId,
                        state: reusable.state,
                        actorKey,
                        reused: true,
                    }),
                );
            }
        }

        lock = await acquirePtyLeaseLock({ actorKey, workspaceKey });

        if (!lock) {
            const existing = await waitForPtyLeaseByWorkspace({
                actorKey,
                workspaceKey,
                attempts: 15,
                delayMs: 150,
            });

            const reusable = await reusableLeaseOrNull({ actorKey, lease: existing });

            if (reusable) {
                return NextResponse.json<EnsureBrowserSessionResult>(
                    buildSessionResponse({
                        sessionId: reusable.sessionId,
                        state: reusable.state,
                        actorKey,
                        reused: true,
                    }),
                );
            }

            return NextResponse.json<EnsureBrowserSessionResult>(
                {
                    ok: false,
                    error: "Terminal is already starting. Please retry in a moment.",
                },
                { status: 409 },
            );
        }

        if (!body.forceNew) {
            const existingAfterLock = await getPtyLeaseByWorkspace({ actorKey, workspaceKey });
            const reusableAfterLock = await reusableLeaseOrNull({
                actorKey,
                lease: existingAfterLock,
            });

            if (reusableAfterLock) {
                return NextResponse.json<EnsureBrowserSessionResult>(
                    buildSessionResponse({
                        sessionId: reusableAfterLock.sessionId,
                        state: reusableAfterLock.state,
                        actorKey,
                        reused: true,
                    }),
                );
            }
        }

        // This is the key prod fix: there should be only one visible shell PTY per learner.
        await cancelOtherActorShellLeases({ actorKey, workspaceKey });

        const out = await startRunnerSessionWithOneCleanupRetry({
            actorKey,
            workspaceKey,
            body,
        });

        if (!out.ok) {
            return NextResponse.json<EnsureBrowserSessionResult>(out, {
                status: 400,
            });
        }

        await rememberPtyLease({
            actorKey,
            workspaceKey,
            sessionId: out.sessionId,
            state: out.state,
        });

        return NextResponse.json<EnsureBrowserSessionResult>(
            buildSessionResponse({
                sessionId: out.sessionId,
                state: out.state,
                actorKey,
                reused: false,
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
    } finally {
        if (lock) {
            await releasePtyLeaseLock(lock).catch(() => {});
        }
    }
}
