import type { RunEvent, RunSessionState } from "@zoeskoul/code-contracts";
import type { NodeJSStream } from "../types.js";
import { RunEventInput } from "@zoeskoul/code-contracts";

type SessionRecord = {
    id: string;
    containerId: string;
    workspaceDir: string;
    state: RunSessionState;
    seq: number;
    events: RunEvent[];
    attachStream?: NodeJSStream | null;
    lastActivityAt: number;
};

type SessionListener = (event: RunEvent) => void;

const sessions = new Map<string, SessionRecord>();
const listeners = new Map<string, Set<SessionListener>>();

function nowIso() {
    return new Date().toISOString();
}

export function createSession(args: {
    id: string;
    containerId: string;
    workspaceDir: string;
}) {
    const session: SessionRecord = {
        id: args.id,
        containerId: args.containerId,
        workspaceDir: args.workspaceDir,
        state: "queued",
        seq: 0,
        events: [],
        attachStream: null,
        lastActivityAt: Date.now(),
    };

    sessions.set(session.id, session);
    return session;
}

export function getSession(id: string) {
    return sessions.get(id) ?? null;
}

export function setSessionStream(id: string, stream: NodeJSStream) {
    const session = sessions.get(id);
    if (!session) return null;

    session.attachStream = stream;
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
    }

    session.events.push(full);
    session.lastActivityAt = Date.now();
    sessions.set(id, session);

    const subs = listeners.get(id);
    if (subs) {
        for (const fn of subs) {
            try {
                fn(full);
            } catch {}
        }
    }

    return full;
}

export function deleteSession(id: string) {
    sessions.delete(id);
    listeners.delete(id);
}