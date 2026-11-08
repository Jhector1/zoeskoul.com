"use client";

import { assertWorkspaceRelativePath } from "@zoeskoul/code-contracts";
import { decodeWorkspaceFileV6Directory } from "./workspaceFileReadV6";
import { requestWorkspaceFileV6, WorkspaceFileV6Error,
    type WorkspaceFileV6Operation, type WorkspaceFileV6Success } from "./workspaceFileClientV6";

/**
 * Explicit structural intent bridge for the opt-in V6 session.
 *
 * This is not a snapshot-diff engine. In particular, a file rename MUST NOT
 * be inferred from a delete + create pair. The host IDE is responsible for
 * invoking an action before changing its tree and for reconciling its local
 * state after a successful, potentially non-idempotent server mutation.
 *
 * No V5 fallback, automatic retry, optimistic editor mutation, or persistence
 * promise is allowed here. The server owns path, tenant, and CAS enforcement.
 */
export type WorkspaceStructuralIntentV6 =
    | Readonly<{ kind: "mkdir"; path: string }>
    | Readonly<{ kind: "rmdir"; path: string }>
    | Readonly<{ kind: "move_file"; path: string; destinationPath: string; expectedRevision: string }>
    | Readonly<{ kind: "move_directory"; path: string; destinationPath: string }>
    | Readonly<{ kind: "trash_directory"; path: string }>
    | Readonly<{ kind: "restore_directory"; path: string; trashId: string }>;

export type WorkspaceStructuralResultV6 = Readonly<{
    state: "reconciliation_required";
    kind: WorkspaceStructuralIntentV6["kind"];
    path: string;
    destinationPath?: string;
    trashId?: string;
}>;

export type WorkspaceTrashEntryV6 = Readonly<{ originalPath: string; trashId: string }>;

type Transport = (
    sessionId: string,
    operation: WorkspaceFileV6Operation,
    options?: Readonly<{ signal?: AbortSignal }>,
) => Promise<WorkspaceFileV6Success>;

const SHA = /^sha256:[a-f0-9]{64}$/;
const TOKEN = /^[a-f0-9]{32}$/;
const SESSION = /^[A-Za-z0-9_-]{1,128}$/;

function checkedPath(path: string): string {
    if (typeof path !== "string" || !path || path.startsWith("/") ||
        path.includes("\\") || path.includes("\0") ||
        path.split("/").some((part) => !part || part === "." || part === "..")) {
        throw new WorkspaceFileV6Error("INVALID_PATH", 400);
    }
    try {
        if (assertWorkspaceRelativePath(path) !== path) {
            throw new WorkspaceFileV6Error("INVALID_PATH", 400);
        }
    } catch {
        throw new WorkspaceFileV6Error("INVALID_PATH", 400);
    }
    return path;
}

function checkedRevision(reply: WorkspaceFileV6Success): string {
    if (typeof reply.revision !== "string" || !SHA.test(reply.revision)) {
        throw new WorkspaceFileV6Error("INVALID_RESPONSE", 502);
    }
    return reply.revision;
}

function checkedTrashId(reply: WorkspaceFileV6Success): string {
    if (typeof reply.trashId !== "string" || !TOKEN.test(reply.trashId)) {
        throw new WorkspaceFileV6Error("INVALID_RESPONSE", 502);
    }
    return reply.trashId;
}

/** One instance belongs to one Runner session and one UI synchronization authority. */
export class WorkspaceStructuralActionsV6 {
    private readonly abort = new AbortController();
    private disposed = false;
    private inFlight = false;

    constructor(
        readonly sessionId: string,
        /** Return false while ANY local edit is unsaved, even outside the subtree. */
        private readonly assertEditorClean: () => boolean | Promise<boolean>,
        private readonly transport: Transport = requestWorkspaceFileV6,
    ) {
        if (!SESSION.test(sessionId)) throw new WorkspaceFileV6Error("INVALID_SESSION", 400);
    }

    dispose(): void {
        this.disposed = true;
        this.abort.abort();
    }

    private ensureActive(): void {
        if (this.disposed) throw new WorkspaceFileV6Error("SESSION_DISPOSED", 409);
    }

    private async send(operation: WorkspaceFileV6Operation): Promise<WorkspaceFileV6Success> {
        this.ensureActive();
        const response = await this.transport(this.sessionId, operation, { signal: this.abort.signal });
        this.ensureActive();
        if (!response || response.ok !== true) {
            throw new WorkspaceFileV6Error("INVALID_RESPONSE", 502);
        }
        return response;
    }

    private async assertClean(): Promise<void> {
        this.ensureActive();
        if ((await this.assertEditorClean()) !== true) {
            throw new WorkspaceFileV6Error("LOCAL_DRAFT_CHANGED", 409);
        }
        this.ensureActive();
    }

    private async assertAbsent(path: string): Promise<void> {
        const parts = checkedPath(path).split("/");
        const leaf = parts.pop()!;
        const parent = parts.join("/");
        const listing = decodeWorkspaceFileV6Directory(await this.send({ op: "list", path: parent }));
        if (listing.some((entry) => entry.name === leaf)) {
            throw new WorkspaceFileV6Error("CONFLICT", 409);
        }
    }

    async listTrash(): Promise<WorkspaceTrashEntryV6[]> {
        this.ensureActive();
        const response = await this.send({ op: "list_trash", path: "" });
        if (!Array.isArray(response.entries) || response.entries.length > 16) {
            throw new WorkspaceFileV6Error("INVALID_RESPONSE", 502);
        }
        const ids = new Set<string>();
        return response.entries.map((entry: unknown) => {
            if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
                throw new WorkspaceFileV6Error("INVALID_RESPONSE", 502);
            }
            const item = entry as Record<string, unknown>;
            if (typeof item.trashId !== "string" || !TOKEN.test(item.trashId) ||
                ids.has(item.trashId) || typeof item.originalPath !== "string") {
                throw new WorkspaceFileV6Error("INVALID_RESPONSE", 502);
            }
            ids.add(item.trashId);
            return { trashId: item.trashId, originalPath: checkedPath(item.originalPath) };
        });
    }

    async execute(intent: WorkspaceStructuralIntentV6): Promise<WorkspaceStructuralResultV6> {
        this.ensureActive();
        if (this.inFlight) throw new WorkspaceFileV6Error("OPERATION_IN_PROGRESS", 409);
        this.inFlight = true;
        try {
            const path = checkedPath(intent.path);
            await this.assertClean();
            let response: WorkspaceFileV6Success;
            let destinationPath: string | undefined;
            switch (intent.kind) {
                case "mkdir":
                    await this.assertAbsent(path);
                    await this.assertClean();
                    response = await this.send({ op: "mkdir", path });
                    if (response.created !== true) throw new WorkspaceFileV6Error("INVALID_RESPONSE", 502);
                    break;
                case "rmdir":
                    await this.assertClean();
                    response = await this.send({ op: "rmdir", path, expectedRevision: null });
                    if (response.deleted !== true) throw new WorkspaceFileV6Error("INVALID_RESPONSE", 502);
                    break;
                case "move_file": {
                    destinationPath = checkedPath(intent.destinationPath);
                    if (destinationPath === path) throw new WorkspaceFileV6Error("INVALID_PATH", 400);
                    if (!SHA.test(intent.expectedRevision)) {
                        throw new WorkspaceFileV6Error("INVALID_REVISION", 400);
                    }
                    const remote = await this.send({ op: "read", path });
                    if (checkedRevision(remote) !== intent.expectedRevision) {
                        throw new WorkspaceFileV6Error("CONFLICT", 409);
                    }
                    await this.assertAbsent(destinationPath);
                    await this.assertClean();
                    response = await this.send({ op: "move", path, destinationPath,
                        expectedRevision: intent.expectedRevision });
                    if (response.moved !== true || response.kind !== "file") {
                        throw new WorkspaceFileV6Error("INVALID_RESPONSE", 502);
                    }
                    break;
                }
                case "move_directory": {
                    destinationPath = checkedPath(intent.destinationPath);
                    if (destinationPath === path || destinationPath.startsWith(`${path}/`)) {
                        throw new WorkspaceFileV6Error("INVALID_PATH", 400);
                    }
                    const revision = checkedRevision(await this.send({ op: "inspect", path }));
                    await this.assertAbsent(destinationPath);
                    await this.assertClean();
                    response = await this.send({ op: "move_directory", path, destinationPath,
                        expectedRevision: revision });
                    if (response.moved !== true || response.kind !== "directory") {
                        throw new WorkspaceFileV6Error("INVALID_RESPONSE", 502);
                    }
                    break;
                }
                case "trash_directory": {
                    const revision = checkedRevision(await this.send({ op: "inspect", path }));
                    await this.assertClean();
                    response = await this.send({ op: "trash_directory", path, expectedRevision: revision });
                    if (response.trashed !== true) throw new WorkspaceFileV6Error("INVALID_RESPONSE", 502);
                    break;
                }
                case "restore_directory": {
                    if (!TOKEN.test(intent.trashId)) {
                        throw new WorkspaceFileV6Error("INVALID_REQUEST", 400);
                    }
                    const entries = await this.listTrash();
                    if (!entries.some((entry) => entry.trashId === intent.trashId && entry.originalPath === path)) {
                        throw new WorkspaceFileV6Error("CONFLICT", 409);
                    }
                    await this.assertAbsent(path);
                    await this.assertClean();
                    response = await this.send({ op: "restore_directory", path,
                        trashId: intent.trashId, expectedRevision: null });
                    if (response.restored !== true) throw new WorkspaceFileV6Error("INVALID_RESPONSE", 502);
                    break;
                }
                default:
                    throw new WorkspaceFileV6Error("INVALID_REQUEST", 400);
            }
            // A successful operation must be reconciled into the IDE workspace
            // and session baseline before further file saves/terminal commands.
            return {
                state: "reconciliation_required",
                kind: intent.kind,
                path,
                ...(destinationPath ? { destinationPath } : {}),
                ...(intent.kind === "trash_directory" ? { trashId: checkedTrashId(response) } : {}),
            };
        } finally {
            this.inFlight = false;
        }
    }
}
