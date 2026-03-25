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

const sessions = new Map<string, SessionRecord>();

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

    return full;
}

export function deleteSession(id: string) {
    sessions.delete(id);
}