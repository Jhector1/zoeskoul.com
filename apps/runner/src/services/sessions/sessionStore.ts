import type { RunEvent, RunSessionState } from "@zoeskoul/code-contracts";

type SessionRecord = {
    id: string;
    containerId: string;
    workspaceDir: string;
    state: RunSessionState;
    seq: number;
    events: RunEvent[];
    attachStream?: NodeJS.ReadWriteStream | null;
};

const sessions = new Map<string, SessionRecord>();

function now() {
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
    };

    sessions.set(session.id, session);
    return session;
}

export function getSession(id: string) {
    return sessions.get(id) ?? null;
}

export function setSessionStream(id: string, stream: NodeJS.ReadWriteStream) {
    const s = sessions.get(id);
    if (!s) return null;
    s.attachStream = stream;
    sessions.set(id, s);
    return s;
}

export function pushEvent(
    id: string,
    event: Omit<RunEvent, "seq" | "ts">,
) {
    const s = sessions.get(id);
    if (!s) return null;

    const full = {
        ...event,
        seq: ++s.seq,
        ts: now(),
    } as RunEvent;

    if (event.type === "status") {
        s.state = event.state;
    }

    s.events.push(full);
    sessions.set(id, s);
    return full;
}