"use client";

import { assertWorkspaceRelativePath, resolveWorkspaceFileCapability,
    type WorkspaceSyncEntry } from "@zoeskoul/code-contracts";
import { isWorkspaceInternalPath } from "@zoeskoul/learner-workspace/lib/projects/workspaceInternalPaths";
import { isBinaryWorkspaceEntry } from "@zoeskoul/learner-workspace/lib/ide/workspaceFileContent";
import { assertWorkspaceFileV6BinaryData } from "./workspaceFileBinaryV6";
import { WorkspaceFileV6Error } from "./workspaceFileClientV6";
import type { WorkspaceFileRevisionV6 } from "./workspaceFileRevisionV6";

// Defense in depth: mirror V6 worker's reserved path components before any
// read/list transport. The Runner separately enforces its own path policy.
// isWorkspaceInternalPath does not currently reject every worker-private path.
const WORKER_PRIVATE_PATH_PARTS = new Set([
    ".git", ".zoeskoul", ".bash_history", "build", "node_modules",
    ".next", "dist", "target", "__pycache__", ".zoe-workspace-internal",
    ".zoe-v6-trash",
]);
function isWorkerPrivateRestorePath(path: string): boolean {
    return path.split("/").some(part => WORKER_PRIVATE_PATH_PARTS.has(part) ||
        part.startsWith(".zoe-v6-file-") || part.startsWith(".zoe-sync-"));
}

/**
 * Internal V6 Undo for a CONFIRMED single-file deletion.
 * The path must still be absent on the Runner. No V5 fallback, no optimistic
 * tree edits, no retry after an ambiguous response. Restores exact file bytes;
 * executable permission metadata is not part of the current snapshot contract.
 */
export async function restoreDeletedWorkspaceFileV6(
    path: string,
    entry: WorkspaceSyncEntry,
    revision: Pick<WorkspaceFileRevisionV6,
        "readText" | "readBinary" | "acknowledgeRead" | "writeText" | "writeBinary">,
    isClean: () => boolean,
    markReconciliationRequired: () => void,
): Promise<void> {
    if (!entry || entry.kind !== "file" || entry.path !== path ||
        assertWorkspaceRelativePath(path) !== path || isWorkspaceInternalPath(path) ||
        isWorkerPrivateRestorePath(path)) {
        throw new WorkspaceFileV6Error("INVALID_PATH", 400);
    }
    const storage = resolveWorkspaceFileCapability(path)?.storage;
    const binary = isBinaryWorkspaceEntry(entry);
    if (!storage || storage !== (binary ? "binary" : "text")) {
        throw new WorkspaceFileV6Error("UNSUPPORTED_FILE", 409);
    }
    if (binary) {
        assertWorkspaceFileV6BinaryData(entry.data, entry.sizeBytes);
    } else if (!("content" in entry) || typeof entry.content !== "string") {
        throw new WorkspaceFileV6Error("INVALID_DATA", 400);
    }
    if (!isClean()) throw new WorkspaceFileV6Error("LOCAL_DRAFT_CHANGED", 409);
    const remote = binary ? await revision.readBinary(path) : await revision.readText(path);
    if (remote.exists) throw new WorkspaceFileV6Error("CONFLICT", 409);
    if (!isClean()) throw new WorkspaceFileV6Error("LOCAL_DRAFT_CHANGED", 409);
    // Only a verified Runner read/list absence may seed expectedRevision=null.
    // If a terminal creates the file between read and write, CAS refuses it.
    revision.acknowledgeRead(path, null);
    // A transport failure may occur after the server committed. Do not replay.
    markReconciliationRequired();
    if (binary) await revision.writeBinary(path, entry.data, entry.sizeBytes);
    else await revision.writeText(path, (entry as {content:string}).content);
}

/** Undo/Redo of an acknowledged content edit. Never overwrites terminal changes. */
export async function replaceHistoryWorkspaceFileV6(
    path: string,
    expected: WorkspaceSyncEntry,
    desired: WorkspaceSyncEntry,
    revision: Pick<WorkspaceFileRevisionV6,
        "readText" | "readBinary" | "acknowledgeRead" | "writeText" | "writeBinary">,
    isClean: () => boolean,
    markReconciliationRequired: () => void,
): Promise<void> {
    if (!expected || !desired || expected.kind !== "file" || desired.kind !== "file" ||
        expected.path !== path || desired.path !== path ||
        assertWorkspaceRelativePath(path) !== path || isWorkspaceInternalPath(path) ||
        isWorkerPrivateRestorePath(path)) {
        throw new WorkspaceFileV6Error("INVALID_PATH", 400);
    }
    const storage = resolveWorkspaceFileCapability(path)?.storage;
    const oldBinary = isBinaryWorkspaceEntry(expected);
    const newBinary = isBinaryWorkspaceEntry(desired);
    if (!storage || oldBinary !== newBinary || storage !== (newBinary ? "binary" : "text")) {
        throw new WorkspaceFileV6Error("UNSUPPORTED_FILE", 409);
    }
    if (newBinary) {
        assertWorkspaceFileV6BinaryData(desired.data, desired.sizeBytes);
        if (!isBinaryWorkspaceEntry(expected)) {
            throw new WorkspaceFileV6Error("UNSUPPORTED_FILE", 409);
        }
        assertWorkspaceFileV6BinaryData(expected.data, expected.sizeBytes);
    } else if (!("content" in desired) || typeof desired.content !== "string" ||
        !("content" in expected) || typeof expected.content !== "string") {
        throw new WorkspaceFileV6Error("INVALID_DATA", 400);
    }
    if (!isClean()) throw new WorkspaceFileV6Error("LOCAL_DRAFT_CHANGED", 409);
    const remote = oldBinary ? await revision.readBinary(path) : await revision.readText(path);
    if (!remote.exists || (oldBinary
        ? !("data" in remote) || remote.data !== (expected as {data:string}).data
        : !("content" in remote) || remote.content !== (expected as {content:string}).content)) {
        throw new WorkspaceFileV6Error("CONFLICT", 409);
    }
    if (!isClean()) throw new WorkspaceFileV6Error("LOCAL_DRAFT_CHANGED", 409);
    revision.acknowledgeRead(path, remote.revision);
    markReconciliationRequired();
    if (newBinary) await revision.writeBinary(path, desired.data, desired.sizeBytes);
    else await revision.writeText(path, (desired as {content:string}).content);
}
