"use client";

import type { WorkspaceSyncEntry } from "@zoeskoul/code-contracts";
import { assertWorkspaceRelativePath, resolveWorkspaceFileCapability } from "@zoeskoul/code-contracts";
import { assertWorkspaceFileV6BinaryData } from "./workspaceFileBinaryV6";
import {
    isBinaryWorkspaceEntry,
} from "@zoeskoul/learner-workspace/lib/ide/workspaceFileContent";
import {
    normalizeWorkspaceSyncEntry,
    workspaceSyncEntryValue,
} from "@zoeskoul/learner-workspace/lib/projects/workspaceSyncEntries";
import { WorkspaceFileV6Error } from "./workspaceFileClientV6";
import { WorkspaceFileRevisionV6 } from "./workspaceFileRevisionV6";

type ChangedFile = Readonly<{
    format: "text" | "binary";
    path: string;
    previous: WorkspaceSyncEntry | null;
    next: WorkspaceSyncEntry | null;
}>;

/**
 * Opt-in single-authority V6 terminal writer. Text and binary files share CAS:
 * structural edits cannot be inferred from a flat snapshot and must fail
 * closed, never silently fall back to V5 replace-workspace.
 *
 * The returned commit callback is called for EACH acknowledged file mutation.
 * A batch is not atomic: after a partial success the controller must advance
 * its baseline only for the acknowledged mutations, preserving the remaining
 * unsaved editor data for an explicit later reconciliation.
 */
export async function pushWorkspaceFileDeltaV6(args: Readonly<{
    revision: WorkspaceFileRevisionV6;
    baseline: WorkspaceSyncEntry[];
    desired: WorkspaceSyncEntry[];
    /** Latest live editor state, to avoid committing a stale queued draft. */
    getLatestEntries: () => WorkspaceSyncEntry[];
    onCommitted: (path: string, next: WorkspaceSyncEntry | null) => void;
}>): Promise<void> {
    const baseline = indexed(args.baseline);
    const desired = indexed(args.desired);
    const changed: ChangedFile[] = [];

    for (const path of new Set([...baseline.keys(), ...desired.keys()])) {
        const previous = baseline.get(path) ?? null;
        const next = desired.get(path) ?? null;
        if (previous && next && previous.kind === next.kind &&
            workspaceSyncEntryValue(previous) === workspaceSyncEntryValue(next)) {
            continue;
        }
        // Structural operations need their own audited, revision-checked
        // orchestration. This opt-in writer must not simulate a directory
        // removal by deleting children or use V5 as a fallback.
        if (previous?.kind === "directory" || next?.kind === "directory") {
            throw new WorkspaceFileV6Error("STRUCTURAL_CHANGE_REQUIRES_V6_INTEGRATION", 409);
        }
        const previousBinary = Boolean(previous && isBinaryWorkspaceEntry(previous));
        const nextBinary = Boolean(next && isBinaryWorkspaceEntry(next));
        if (previous && next && previousBinary !== nextBinary) {
            throw new WorkspaceFileV6Error("FILE_FORMAT_CHANGE_REQUIRES_EXPLICIT_ACTION", 409);
        }
        const format = previousBinary || nextBinary ? "binary" : "text";
        if (resolveWorkspaceFileCapability(path)?.storage !== format) {
            throw new WorkspaceFileV6Error("UNSUPPORTED_FILE", 409);
        }
        if (format === "binary") {
            if (previous) binaryContent(previous);
            if (next) binaryContent(next);
        }
        changed.push({ path, previous, next, format });
    }

    // A file rename appears in an editor snapshot as delete + create. Use the
    // worker's atomic no-overwrite move operation instead of emulating it with
    // two separate mutations, which could lose the source on partial failure.
    if (changed.some((entry) => entry.previous && !entry.next) &&
        changed.some((entry) => !entry.previous && entry.next)) {
        throw new WorkspaceFileV6Error("MOVE_REQUIRES_V6_INTEGRATION", 409);
    }

    // Preflight EVERY file before committing any mutation. A CAS can still
    // fail later due to a terminal write, and this is intentionally not
    // presented as a multi-file transaction.
    for (const change of changed) {
        const remote = change.format === "binary"
            ? await args.revision.readBinary(change.path)
            : await args.revision.readText(change.path);
        if (change.previous === null) {
            if (remote.exists) throw new WorkspaceFileV6Error("CONFLICT", 409);
        } else if (!remote.exists ||
            (change.format === "binary"
                ? !("data" in remote) || remote.data !== binaryContent(change.previous)
                : !("content" in remote) || remote.content !== textContent(change.previous))) {
            throw new WorkspaceFileV6Error("CONFLICT", 409);
        }
        args.revision.acknowledgeRead(
            change.path,
            remote.exists ? remote.revision : null,
        );
    }

    for (const change of changed) {
        const live = indexed(args.getLatestEntries()).get(change.path) ?? null;
        const expected = change.next;
        if (!sameEntry(live, expected)) {
            throw new WorkspaceFileV6Error("LOCAL_DRAFT_CHANGED", 409);
        }
        if (change.next) {
            if (change.format === "binary") {
                await args.revision.writeBinary(change.path, binaryContent(change.next));
            } else {
                await args.revision.writeText(change.path, textContent(change.next));
            }
        } else {
            await args.revision.deleteFile(change.path);
        }
        args.onCommitted(change.path, change.next);
    }
}

function sameEntry(a: WorkspaceSyncEntry | null, b: WorkspaceSyncEntry | null): boolean {
    return a === b || Boolean(
        a && b && a.kind === b.kind && a.path === b.path &&
        workspaceSyncEntryValue(a) === workspaceSyncEntryValue(b),
    );
}

function indexed(entries: WorkspaceSyncEntry[]): Map<string, WorkspaceSyncEntry> {
    const result = new Map<string, WorkspaceSyncEntry>();
    for (const original of entries) {
        const entry = normalizeWorkspaceSyncEntry(original);
        // Do not normalize an unsafe incoming path into a safe-looking one.
        if (original.path !== entry.path) {
            throw new WorkspaceFileV6Error("INVALID_PATH", 400);
        }
        let safe: string;
        try {
            safe = assertWorkspaceRelativePath(entry.path);
        } catch {
            throw new WorkspaceFileV6Error("INVALID_PATH", 400);
        }
        if (safe !== entry.path || result.has(safe)) {
            throw new WorkspaceFileV6Error("INVALID_PATH", 400);
        }
        result.set(safe, entry);
    }
    return result;
}

function textContent(entry: WorkspaceSyncEntry): string {
    if (entry.kind === "directory" || isBinaryWorkspaceEntry(entry) ||
        !("content" in entry) || typeof entry.content !== "string") {
        throw new WorkspaceFileV6Error("UNSUPPORTED_FILE", 409);
    }
    return entry.content;
}

function binaryContent(entry: WorkspaceSyncEntry): string {
    if (entry.kind === "directory" || !isBinaryWorkspaceEntry(entry)) {
        throw new WorkspaceFileV6Error("UNSUPPORTED_FILE", 409);
    }
    assertWorkspaceFileV6BinaryData(entry.data, entry.sizeBytes);
    return entry.data;
}
