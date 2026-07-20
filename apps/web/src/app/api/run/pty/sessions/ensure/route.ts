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
    acquirePtyLeaseLock,
    forgetPtyLeaseBySession,
    getPtyLeaseByOwner,
    listPtyLeasesByActor,
    maxPtySessionsPerActor,
    normalizePtyIdentityKey,
    normalizeWorkspaceKey,
    releasePtyLeaseLock,
    rememberPtyLease,
} from "@/lib/server/ptySessionLeases";
import {
    isRedisUnavailableError,
    redisUnavailableMessage,
} from "@/lib/server/redis";

export const runtime = "nodejs";

const ENSURE_START_LOCK_WAIT_ATTEMPTS = 80;
const ENSURE_START_LOCK_WAIT_DELAY_MS = 250;

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

async function buildSessionResponse(args: {
    sessionId: string;
    state: RunSessionState;
    actorKey: string;
    reused: boolean;
}): Promise<EnsureBrowserSessionResult> {
    const attachToken = createAttachToken({
        sessionId: args.sessionId,
        actorKey: args.actorKey,
    });
    let activeCount: number;
    let maxActiveSessions: number;

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
        forceNew: _forceNew,
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

            return false;
        }

        throw error;
    }
}

async function cancelOwnedSession(args: {
    actorKey: string;
    sessionId: string;
}) {
    try {
        await runnerPost<CancelSessionResponse>(
            `/sessions/${encodeURIComponent(args.sessionId)}/cancel`,
            args.actorKey,
        );
    } catch (error) {
        if (!isStaleRunnerSessionError(error)) throw error;
    } finally {
        await forgetPtyLeaseBySession(args).catch(() => {});
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
                await buildSessionResponse({
                    sessionId: out.sessionId,
                    state: out.state,
                    actorKey,
                    reused: false,
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

        await reconcilePtyLeasesWithRunner({ actorKey }).catch((error) => {
            console.warn("PTY ensure lease reconciliation skipped", {
                message: error instanceof Error ? error.message : String(error),
            });
        });

        const findReusableOwnerLease = async () => {
            const existing = await getPtyLeaseByOwner({ actorKey, ownerKey });
            if (!existing) return null;

            if (!(await canReusePtyLease({ actorKey, sessionId: existing.sessionId }))) {
                return null;
            }

            return await rememberPtyLease({
                actorKey,
                hostKey,
                ownerKey,
                workspaceKey,
                sessionId: existing.sessionId,
                state: existing.state,
                createdAt: existing.createdAt,
            });
        };

        if (!body.forceNew) {
            const reusable = await findReusableOwnerLease();
            if (reusable) {
                return NextResponse.json<EnsureBrowserSessionResult>(
                    await buildSessionResponse({
                        sessionId: reusable.sessionId,
                        state: reusable.state,
                        actorKey,
                        reused: true,
                    }),
                );
            }
        }

        lock = await acquirePtyLeaseLock({ actorKey, ownerKey });

        if (!lock) {
            for (let attempt = 0; attempt < ENSURE_START_LOCK_WAIT_ATTEMPTS; attempt += 1) {
                if (!body.forceNew) {
                    const reusable = await findReusableOwnerLease();
                    if (reusable) {
                        return NextResponse.json<EnsureBrowserSessionResult>(
                            await buildSessionResponse({
                                sessionId: reusable.sessionId,
                                state: reusable.state,
                                actorKey,
                                reused: true,
                            }),
                        );
                    }
                }

                await new Promise((resolve) =>
                    setTimeout(resolve, ENSURE_START_LOCK_WAIT_DELAY_MS),
                );

                lock = await acquirePtyLeaseLock({ actorKey, ownerKey });
                if (lock) break;
            }

            if (!lock) {
                return NextResponse.json<EnsureBrowserSessionResult>(
                    {
                        ok: false,
                        error: "This terminal is already starting. Please retry in a moment.",
                    },
                    { status: 409 },
                );
            }
        }

        const existingAfterLock = await getPtyLeaseByOwner({ actorKey, ownerKey });

        if (body.forceNew && existingAfterLock) {
            await cancelOwnedSession({
                actorKey,
                sessionId: existingAfterLock.sessionId,
            });
        } else if (existingAfterLock) {
            const reusable = await findReusableOwnerLease();
            if (reusable) {
                return NextResponse.json<EnsureBrowserSessionResult>(
                    await buildSessionResponse({
                        sessionId: reusable.sessionId,
                        state: reusable.state,
                        actorKey,
                        reused: true,
                    }),
                );
            }
        }

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
