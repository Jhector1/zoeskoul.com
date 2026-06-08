// apps/runner/src/services/sessions/sessionStore.ts
import type {
  RunEvent,
  RunEventInput,
  RunSessionState,
} from "@zoeskoul/code-contracts";
import { env } from "../../lib/env.js";

export type NodeJSStream = NodeJS.ReadWriteStream;

export type SessionRecord = {
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
const pendingStartsByActor = new Map<string, number>();
let pendingStartsGlobal = 0;

function nowIso() {
  return new Date().toISOString();
}

export function isTerminalState(state: string) {
  return (
    state === "completed" ||
    state === "failed" ||
    state === "canceled" ||
    state === "timed_out"
  );
}

function isActiveSession(session: SessionRecord) {
  return !isTerminalState(session.state);
}

export function getSessionStats() {
  let active = 0;
  let finalized = 0;
  const activeByActor: Record<string, number> = {};

  for (const session of sessions.values()) {
    if (isActiveSession(session)) {
      active += 1;
      const actor = session.ownerKey ?? "anonymous";
      activeByActor[actor] = (activeByActor[actor] ?? 0) + 1;
    } else {
      finalized += 1;
    }
  }

  return {
    total: sessions.size,
    active,
    finalized,
    pendingStartsGlobal,
    activeByActor,
  };
}

export function countActiveSessionsForActor(ownerKey: string) {
  let count = pendingStartsByActor.get(ownerKey) ?? 0;
  for (const session of sessions.values()) {
    if (session.ownerKey === ownerKey && isActiveSession(session)) count += 1;
  }
  return count;
}

export function countActiveSessionsGlobal() {
  let count = pendingStartsGlobal;
  for (const session of sessions.values()) {
    if (isActiveSession(session)) count += 1;
  }
  return count;
}

export function reserveSessionSlot(ownerKey: string) {
  const actorCount = countActiveSessionsForActor(ownerKey);
  if (actorCount >= env.maxConcurrentPerActor) {
    throw new Error(
      `Too many active sessions. Limit is ${env.maxConcurrentPerActor} per user.`,
    );
  }

  const globalCount = countActiveSessionsGlobal();
  if (globalCount >= env.maxConcurrentGlobal) {
    throw new Error(
      `Runner is busy. Global active session limit is ${env.maxConcurrentGlobal}.`,
    );
  }

  pendingStartsByActor.set(
    ownerKey,
    (pendingStartsByActor.get(ownerKey) ?? 0) + 1,
  );
  pendingStartsGlobal += 1;

  let released = false;
  return () => {
    if (released) return;
    released = true;

    const current = pendingStartsByActor.get(ownerKey) ?? 0;
    if (current <= 1) pendingStartsByActor.delete(ownerKey);
    else pendingStartsByActor.set(ownerKey, current - 1);
    pendingStartsGlobal = Math.max(0, pendingStartsGlobal - 1);
  };
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

export function getAllSessions() {
  return [...sessions.values()];
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
