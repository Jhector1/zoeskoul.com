"use client";

import { resolveWorkspaceFileCapability } from "@zoeskoul/code-contracts";
import { assertWorkspaceFileV6BinaryData, decodeWorkspaceFileV6BinaryRead, type WorkspaceFileV6BinaryReadResult } from "./workspaceFileBinaryV6";
import {
    decodeWorkspaceFileV6Directory,
    decodeWorkspaceFileV6TextRead,
    type WorkspaceFileV6ReadResult,
} from "./workspaceFileReadV6";
import {
    encodeWorkspaceFileV6Text,
    isWorkspaceFileV6Conflict,
    requestWorkspaceFileV6,
    WorkspaceFileV6Error,
    type WorkspaceFileV6Operation,
    type WorkspaceFileV6Success,
} from "./workspaceFileClientV6";

/**
 * Session-bound, opt-in revision coordination for V6 text and binary files.
 *
 * The V5 whole-workspace synchronization controller remains authoritative until
 * an explicit, separately tested cutover. Never run both writers against the
 * same live workspace. This class does not auto-save editor content, merge
 * terminal snapshots, or retry conflicts. The caller retains unsaved text.
 */
type Transport = (
    sessionId: string,
    operation: WorkspaceFileV6Operation,
    options?: Readonly<{ signal?: AbortSignal }>,
) => Promise<WorkspaceFileV6Success>;

type RevisionState =
    | Readonly<{ state: "unknown" }>
    | Readonly<{ state: "known"; revision: string | null }>
    | Readonly<{ state: "conflict" }>
    | Readonly<{ state: "needs_read" }>;

const REVISION_PATTERN = /^sha256:[a-f0-9]{64}$/;
const SESSION_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

function validatedRevision(value: unknown): string | null {
    if (value === null) return null;
    if (typeof value === "string" && REVISION_PATTERN.test(value)) return value;
    throw new WorkspaceFileV6Error("INVALID_REVISION", 502);
}

function checkedPath(path: string): string {
    if (typeof path !== "string" || !path || path.startsWith("/") ||
        path.includes("\\") || path.split("/").some(
            (part) => part === "" || part === "." || part === "..",
        )) {
        throw new WorkspaceFileV6Error("INVALID_PATH", 400);
    }
    return path;
}

/**
 * A single V6 coordinator belongs to exactly one actual Runner session.
 * A new terminal session must receive a new coordinator to prevent a stale
 * revision from being applied to a different container/workspace.
 */
export class WorkspaceFileRevisionV6 {
    private readonly revisions = new Map<string, RevisionState>();
    private readonly tails = new Map<string, Promise<void>>();
    private readonly controller = new AbortController();
    private disposed = false;

    constructor(
        readonly sessionId: string,
        private readonly transport: Transport = requestWorkspaceFileV6,
    ) {
        if (!SESSION_PATTERN.test(sessionId)) {
            throw new WorkspaceFileV6Error("INVALID_SESSION", 400);
        }
    }

    /** Last confirmed server revision. No cached editor text is kept here. */
    stateFor(path: string): RevisionState {
        const key = checkedPath(path);
        return this.revisions.get(key) ?? { state: "unknown" };
    }

    /**
     * Read authoritative worker content; do NOT automatically adopt its revision.
     * The editor must first reconcile its dirty draft, then explicitly call
     * acknowledgeRead(path, result.exists ? result.revision : null).
     * This deliberately keeps CONFLICT/needs_read states blocked while the
     * user decides how to reconcile competing terminal/editor changes.
     */
    async readText(path: string): Promise<WorkspaceFileV6ReadResult> {
        const key = checkedPath(path);
        if (resolveWorkspaceFileCapability(key)?.storage !== "text") {
            throw new WorkspaceFileV6Error("UNSUPPORTED_FILE", 400);
        }
        this.ensureActive();
        return this.enqueue(key, async () => {
            try {
                const reply = await this.transport(
                    this.sessionId, { op: "read", path: key },
                    { signal: this.controller.signal },
                );
                const result = decodeWorkspaceFileV6TextRead(reply);
                this.ensureActive();
                return result;
            } catch (error) {
                if (!(error instanceof WorkspaceFileV6Error) ||
                    error.code !== "NOT_FOUND" || error.status !== 404) {
                    throw error;
                }
                // The disabled Web proxy also responds with NOT_FOUND/404.
                // A successful, validated parent listing is required before
                // treating this as evidence that a file does not exist.
                const segments = key.split("/");
                const name = segments.pop()!;
                const parent = segments.join("/");
                const listing = await this.transport(
                    this.sessionId, { op: "list", path: parent },
                    { signal: this.controller.signal },
                );
                const entries = decodeWorkspaceFileV6Directory(listing);
                this.ensureActive();
                if (entries.some((entry) => entry.name === name)) {
                    throw new WorkspaceFileV6Error("READ_RACE", 409);
                }
                return { exists: false };
            }
        });
    }

    /** Same 404 guard as text reads: only a successful parent listing proves absence. */
    async readBinary(path: string): Promise<WorkspaceFileV6BinaryReadResult> {
        const key = checkedPath(path);
        if (resolveWorkspaceFileCapability(key)?.storage !== "binary") {
            throw new WorkspaceFileV6Error("UNSUPPORTED_FILE", 400);
        }
        this.ensureActive();
        return this.enqueue(key, async () => {
            try {
                const reply = await this.transport(
                    this.sessionId, { op: "read", path: key },
                    { signal: this.controller.signal },
                );
                const result = decodeWorkspaceFileV6BinaryRead(reply);
                this.ensureActive();
                return result;
            } catch (error) {
                if (!(error instanceof WorkspaceFileV6Error) ||
                    error.code !== "NOT_FOUND" || error.status !== 404) {
                    throw error;
                }
                const segments = key.split("/");
                const name = segments.pop()!;
                const listing = await this.transport(
                    this.sessionId, { op: "list", path: segments.join("/") },
                    { signal: this.controller.signal },
                );
                const entries = decodeWorkspaceFileV6Directory(listing);
                this.ensureActive();
                if (entries.some((entry) => entry.name === name)) {
                    throw new WorkspaceFileV6Error("READ_RACE", 409);
                }
                return { exists: false };
            }
        });
    }

    /**
     * Seed only from a verified V6 read/list result. A missing file is null.
     * Do not seed from an unsynchronized V5 editor snapshot.
     */
    acknowledgeRead(path: string, revision: string | null): void {
        this.ensureActive();
        const key = checkedPath(path);
        if (this.tails.has(key)) {
            throw new WorkspaceFileV6Error("WRITE_IN_PROGRESS", 409);
        }
        this.revisions.set(key, { state: "known", revision: validatedRevision(revision) });
    }

    /**
     * Serializes same-file saves. Always uses the latest confirmed revision,
     * not a stale revision captured before an earlier save resolved.
     */
    async writeText(path: string, text: string): Promise<string> {
        const key = checkedPath(path);
        if (typeof text !== "string") {
            throw new WorkspaceFileV6Error("INVALID_DATA", 400);
        }
        if (resolveWorkspaceFileCapability(key)?.storage !== "text") {
            throw new WorkspaceFileV6Error("UNSUPPORTED_FILE", 400);
        }
        return this.writeEncoded(key, encodeWorkspaceFileV6Text(text));
    }

    async writeBinary(path: string, data: string, expectedSize?: number): Promise<string> {
        const key = checkedPath(path);
        if (resolveWorkspaceFileCapability(key)?.storage !== "binary") {
            throw new WorkspaceFileV6Error("UNSUPPORTED_FILE", 400);
        }
        assertWorkspaceFileV6BinaryData(data, expectedSize);
        return this.writeEncoded(key, data);
    }

    /** Both file formats share the exact same CAS/uncertain-response semantics. */
    private async writeEncoded(key: string, data: string): Promise<string> {
        this.ensureActive();
        return this.enqueue(key, async () => {
            const prior = this.requireKnownRevision(key);
            let response: WorkspaceFileV6Success;
            try {
                response = await this.transport(
                    this.sessionId,
                    { op: "write", path: key, expectedRevision: prior, data },
                    { signal: this.controller.signal },
                );
            } catch (error) {
                if (!this.disposed) {
                    this.revisions.set(key, {
                        state: isWorkspaceFileV6Conflict(error) ? "conflict" : "needs_read",
                    });
                }
                throw error;
            }
            this.ensureActive();
            let revision: string | null;
            try {
                revision = validatedRevision(response.revision);
                if (revision === null) throw new WorkspaceFileV6Error("INVALID_REVISION", 502);
            } catch (error) {
                this.revisions.set(key, { state: "needs_read" });
                throw error;
            }
            this.revisions.set(key, { state: "known", revision });
            return revision;
        });
    }

    async deleteFile(path: string): Promise<void> {
        const key = checkedPath(path);
        this.ensureActive();
        return this.enqueue(key, async () => {
            const prior = this.requireKnownRevision(key);
            try {
                await this.transport(
                    this.sessionId,
                    { op: "delete", path: key, expectedRevision: prior },
                    { signal: this.controller.signal },
                );
            } catch (error) {
                if (!this.disposed) {
                    // A network/worker failure can occur after a mutation
                    // commits. Require an authoritative read before retrying.
                    this.revisions.set(key, {
                        state: isWorkspaceFileV6Conflict(error) ? "conflict" : "needs_read",
                    });
                }
                throw error;
            }
            this.ensureActive();
            this.revisions.set(key, { state: "known", revision: null });
        });
    }

    /** Dispose on terminal session change or unmount, not on editor rerender. */
    dispose(): void {
        this.disposed = true;
        this.controller.abort();
        this.revisions.clear();
    }

    private requireKnownRevision(path: string): string | null {
        const state = this.revisions.get(path);
        if (!state || state.state === "unknown") {
            throw new WorkspaceFileV6Error("REVISION_NOT_LOADED", 428);
        }
        if (state.state === "conflict") {
            throw new WorkspaceFileV6Error("CONFLICT_REQUIRES_RELOAD", 409);
        }
        if (state.state === "needs_read") {
            throw new WorkspaceFileV6Error("REVISION_REVALIDATION_REQUIRED", 428);
        }
        return state.revision;
    }

    private ensureActive(): void {
        if (this.disposed) throw new WorkspaceFileV6Error("SESSION_DISPOSED", 409);
    }

    private async enqueue<T>(path: string, job: () => Promise<T>): Promise<T> {
        const previous = this.tails.get(path) ?? Promise.resolve();
        const run = previous.catch(() => {}).then(async () => {
            this.ensureActive();
            return job();
        });
        const tail = run.then(() => {}, () => {});
        this.tails.set(path, tail);
        try {
            return await run;
        } finally {
            if (this.tails.get(path) === tail) this.tails.delete(path);
        }
    }
}
