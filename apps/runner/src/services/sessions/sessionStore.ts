import type { RunEvent, RunSessionState } from "@zoeskoul/code-contracts";
import type { NodeJSStream } from "../types.js";
import {RunEventInput} from "@zoeskoul/code-contracts";

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
    const s = sessions.get(id);
    if (!s) return null;
    s.attachStream = stream;
    sessions.set(id, s);
    return s;
}

export function touchSession(id: string) {
    const s = sessions.get(id);
    if (!s) return;
    s.lastActivityAt = Date.now();
    sessions.set(id, s);
}

export function pushEvent(
    id: string,
    event: RunEventInput,
) {
    const s = sessions.get(id);
    if (!s) return null;

    const full = {
        ...event,
        seq: ++s.seq,
        ts: nowIso(),
    } as RunEvent;

    if (event.type === "status") {
        s.state = event.state;
    }

    s.events.push(full);
    s.lastActivityAt = Date.now();
    sessions.set(id, s);
    return full;
}

export function deleteSession(id: string) {
    sessions.delete(id);
}