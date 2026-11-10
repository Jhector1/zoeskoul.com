import type { WorkspaceSyncEntry } from "@zoeskoul/code-contracts";

export type V6AcknowledgedEdit = {
    path: string;
    before: WorkspaceSyncEntry | null;
    after: WorkspaceSyncEntry | null;
};

/**
 * Session-scoped, acknowledgement-only content history buffer.
 * A requested draft does NOT become history until the Runner acknowledges it.
 * Coalescing repeated writes of one path avoids claiming unverified intermediate
 * content from the final snapshot. It does not retry or alter any CAS operation.
 */
export class V6AcknowledgedEditJournal {
    private sessionId: string | null = null;
    private readonly changes = new Map<string, V6AcknowledgedEdit>();

    reset(sessionId: string | null): void {
        if (sessionId === this.sessionId) return;
        this.sessionId = sessionId;
        this.changes.clear();
    }

    append(sessionId: string, change: V6AcknowledgedEdit): void {
        this.reset(sessionId);
        const prior = this.changes.get(change.path);
        this.changes.set(change.path, prior
            ? {path: change.path, before: prior.before, after: change.after}
            : {...change});
    }

    hasPending(sessionId: string): boolean {
        return this.sessionId === sessionId && this.changes.size > 0;
    }

    /** Call only after verifying a snapshot containing these acknowledged bytes. */
    drain(sessionId: string): V6AcknowledgedEdit[] {
        if (this.sessionId !== sessionId) return [];
        const result = [...this.changes.values()];
        this.changes.clear();
        return result;
    }
}
