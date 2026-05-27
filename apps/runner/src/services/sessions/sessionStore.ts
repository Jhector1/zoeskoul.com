// apps/runner/src/services/sessions/sessionStore.ts
import type {
    RunEvent,
    RunEventInput,
    RunSessionState,
} from "@zoeskoul/code-contracts";

export type NodeJSStream = NodeJS.ReadWriteStream;

type SessionRecord = {
    id: string;
    ownerKey?: string;
    containerId: string;
    workspaceDir: string;
    state: RunSessionState;
    seq: number;
    events: RunEvent[];
    attachStream?: NodeJSStream | null;
    lastActivityAt: number;
    finalizedAt?: number | null;
    expiresAt?: number | null;
};

type SessionListener = (event: RunEvent) => void;

const sessions = new Map<string, SessionRecord>();
const listeners = new Map<string, Set<SessionListener>>();

function nowIso() {
    return new Date().toISOString();
}

function isTerminalState(state: string) {
    return (
        state === "completed" ||
        state === "failed" ||
        state === "canceled" ||
        state === "timed_out"
    );
}

export function createSession(args: {
    id: string;
    ownerKey?: string;
    containerId: string;
    workspaceDir: string;
}) {
    const session: SessionRecord = {
        id: args.id,
        ownerKey: args.ownerKey,
        containerId: args.containerId,
        workspaceDir: args.workspaceDir,
        state: "queued",
        seq: 0,
        events: [],
        attachStream: null,
        lastActivityAt: Date.now(),
        finalizedAt: null,
        expiresAt: null,
    };

    sessions.set(session.id, session);
    return session;
}

export function getSession(id: string) {
    return sessions.get(id) ?? null;
}

export function deleteSession(id: string) {
    sessions.delete(id);
    listeners.delete(id);
}

export function markSessionFinalized(
    id: string,
    args?: {
        expiresAt?: number | null;
    },
) {
    const session = sessions.get(id);
    if (!session) return null;

    const now = Date.now();
    session.finalizedAt = session.finalizedAt ?? now;
    session.expiresAt = args?.expiresAt ?? session.expiresAt ?? null;
    session.lastActivityAt = now;
    sessions.set(id, session);

    return session;
}

export function setSessionStream(id: string, stream: NodeJSStream) {
    const session = sessions.get(id);
    if (!session) return null;

    session.attachStream = stream;
    session.lastActivityAt = Date.now();
    sessions.set(id, session);
    return session;
}

export function touchSession(id: string) {
    const session = sessions.get(id);
    if (!session) return;

    session.lastActivityAt = Date.now();
    sessions.set(id, session);
}

export function subscribeSession(id: string, listener: SessionListener) {
    let set = listeners.get(id);

    if (!set) {
        set = new Set();
        listeners.set(id, set);
    }

    set.add(listener);

    return () => {
        const current = listeners.get(id);
        if (!current) return;

        current.delete(listener);

        if (current.size === 0) {
            listeners.delete(id);
        }
    };
}

export function pushEvent(id: string, event: RunEventInput) {
    const session = sessions.get(id);
    if (!session) return null;

    const full = {
        ...event,
        seq: ++session.seq,
        ts: nowIso(),
    } as RunEvent;

    if (event.type === "status") {
        session.state = event.state;

        if (isTerminalState(event.state)) {
            session.finalizedAt = session.finalizedAt ?? Date.now();
        }
    }

    session.events.push(full);

    if (session.events.length > 2000) {
        session.events.splice(0, session.events.length - 2000);
    }

    session.lastActivityAt = Date.now();
    sessions.set(id, session);

    const subs = listeners.get(id);

    if (subs) {
        for (const fn of subs) {
            try {
                fn(full);
            } catch {
                // ignore listener errors
            }
        }
    }

    return full;
}