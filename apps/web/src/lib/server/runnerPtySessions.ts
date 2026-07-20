import "server-only";

import type { RunSessionState } from "@zoeskoul/code-contracts";
import { runnerPost } from "@/lib/server/runnerClient";
import {
    forgetPtyLeaseBySession,
    listPtyLeasesByActor,
    rememberPtyLease,
} from "@/lib/server/ptySessionLeases";

export type RunnerPtySessionSummary = {
    sessionId: string;
    state: RunSessionState;
    kind: "code" | "shell" | null;
    workspaceKey: string | null;
    clientHostKey: string | null;
    clientOwnerKey: string | null;
    clientWorkspaceKey: string | null;
    createdAt: number;
    lastActivityAt: number;
};

export type RunnerPtyCapacity = {
    ok: true;
    activeCount: number;
    activeSessionCount: number;
    pendingStartCount: number;
    maxActiveSessions: number;
    sessions: RunnerPtySessionSummary[];
};

function normalizedPositiveInt(value: unknown, fallback: number) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

function normalizeRunnerPtyCapacity(value: RunnerPtyCapacity): RunnerPtyCapacity {
    const sessions = Array.isArray(value.sessions)
        ? value.sessions.filter(
              (session): session is RunnerPtySessionSummary =>
                  Boolean(session?.sessionId && session?.state),
          )
        : [];
    const activeSessionCount = normalizedPositiveInt(
        value.activeSessionCount,
        sessions.length,
    );
    const pendingStartCount = normalizedPositiveInt(value.pendingStartCount, 0);

    return {
        ok: true,
        activeCount: normalizedPositiveInt(
            value.activeCount,
            activeSessionCount + pendingStartCount,
        ),
        activeSessionCount,
        pendingStartCount,
        maxActiveSessions: Math.max(
            1,
            normalizedPositiveInt(value.maxActiveSessions, 1),
        ),
        sessions,
    };
}

export async function readRunnerPtyCapacity(
    actorKey: string,
): Promise<RunnerPtyCapacity> {
    const out = await runnerPost<RunnerPtyCapacity>(
        "/sessions/active",
        actorKey,
        {},
    );

    return normalizeRunnerPtyCapacity(out);
}

/**
 * Redis is a browser-lease cache, not the source of truth for live containers.
 * Repair it from the runner registry after deploys, Redis expiry, or interrupted
 * browser cleanup so the UI and cancellation routes see the same sessions that
 * the runner counts against the user's limit.
 */
export async function reconcilePtyLeasesWithRunner(args: {
    actorKey: string;
    capacity?: RunnerPtyCapacity;
}): Promise<RunnerPtyCapacity> {
    const capacity = args.capacity ?? (await readRunnerPtyCapacity(args.actorKey));
    const runnerSessionIds = new Set(
        capacity.sessions.map((session) => session.sessionId),
    );
    const leases = await listPtyLeasesByActor({ actorKey: args.actorKey });

    await Promise.allSettled(
        leases
            .filter((lease) => !runnerSessionIds.has(lease.sessionId))
            .map((lease) =>
                forgetPtyLeaseBySession({
                    actorKey: args.actorKey,
                    sessionId: lease.sessionId,
                }),
            ),
    );

    await Promise.allSettled(
        capacity.sessions
            .filter(
                (session) =>
                    session.kind === "shell" &&
                    Boolean(session.clientHostKey) &&
                    Boolean(session.clientOwnerKey) &&
                    Boolean(session.clientWorkspaceKey),
            )
            .map((session) =>
                rememberPtyLease({
                    actorKey: args.actorKey,
                    hostKey: session.clientHostKey!,
                    ownerKey: session.clientOwnerKey!,
                    workspaceKey: session.clientWorkspaceKey!,
                    sessionId: session.sessionId,
                    state: session.state,
                    createdAt: session.createdAt,
                }),
            ),
    );

    return capacity;
}

export function runnerSessionsForHost(
    capacity: RunnerPtyCapacity,
    hostKey: string,
) {
    return capacity.sessions.filter(
        (session) => session.clientHostKey === hostKey,
    );
}

export function runnerSessionsForOwner(
    capacity: RunnerPtyCapacity,
    ownerKey: string,
) {
    return capacity.sessions.filter(
        (session) => session.clientOwnerKey === ownerKey,
    );
}
