"use client";

import type { WorkspaceSyncEntry } from "@zoeskoul/code-contracts";
import type {
    WorkspaceExplorerExecutorV6, WorkspaceExplorerIntentV6,
    WorkspaceExplorerResultV6,
} from "@zoeskoul/learner-workspace/runner/runtime";

// V6 operations are server-authoritative. This journal only stores inverse
// intents and content fingerprints, never a local tree to replay into the IDE.
// It is intentionally ephemeral and scoped to a mounted terminal session.
const HISTORY_LIMIT = 30;
const TRASH_TOKEN = /^[a-f0-9]{32}$/;
const supported = new Set(["mkdir", "create_file", "move_file", "move_directory", "trash_directory", "delete_file"]);

export function supportsV6StructuralHistory(intent: WorkspaceExplorerIntentV6): boolean {
    return supported.has(intent.kind);
}

type ReversibleIntent =
    | Readonly<{kind:"mkdir";path:string}>
    | Readonly<{kind:"create_file";path:string}>
    | Readonly<{kind:"restore_file";path:string;entry:WorkspaceSyncEntry}>
    | Readonly<{kind:"replace_file";path:string;entry:WorkspaceSyncEntry}>
    | Readonly<{kind:"move_file";path:string;destinationPath:string}>
    | Readonly<{kind:"move_directory";path:string;destinationPath:string}>
    | Readonly<{kind:"trash_directory";path:string}>
    | Readonly<{kind:"delete_file";path:string}>;
type Snapshot = readonly WorkspaceSyncEntry[];
type Entry = {
    forward: ReversibleIntent;
    inverse: WorkspaceExplorerIntentV6;
    beforePath: string;
    afterPath: string;
    beforeSignature: string | null;
    afterSignature: string | null;
};

/** Fingerprint one subtree, including empty folders and binary bytes. */
export function v6SubtreeSignature(files: Snapshot, path: string): string | null {
    const inside = files.filter(entry => entry.path === path || entry.path.startsWith(`${path}/`));
    if (!inside.length) return null;
    return JSON.stringify(inside.map(entry => {
        const relative = entry.path.slice(path.length);
        if (entry.kind === "directory") return [relative,"directory"];
        if (entry.kind !== "file") throw new Error("Unexpected workspace entry type.");
        if ("encoding" in entry && entry.encoding === "base64") {
            return [relative,"binary",entry.data,entry.sizeBytes];
        }
        if ("content" in entry && typeof entry.content === "string") {
            return [relative,"text",entry.content];
        }
        throw new Error("Snapshot does not contain authoritative file content.");
    }).sort((a,b) => String(a[0]).localeCompare(String(b[0]))));
}

function reverseIntent(forward: ReversibleIntent, result: WorkspaceExplorerResultV6,
    before: Snapshot): WorkspaceExplorerIntentV6 {
    if (forward.kind === "mkdir") return {kind:"rmdir",path:forward.path};
    if (forward.kind === "create_file" || forward.kind === "restore_file") {
        return {kind:"delete_file",path:forward.path};
    }
    if (forward.kind === "replace_file") {
        const matches = before.filter(item => item.path === forward.path && item.kind === "file");
        if (matches.length !== 1) throw new Error("Original file content is unavailable for Undo.");
        return {kind:"replace_file",path:forward.path,entry:{...matches[0]}};
    }
    if (forward.kind === "move_file" || forward.kind === "move_directory") {
        return {kind:forward.kind,path:forward.destinationPath,destinationPath:forward.path};
    }
    if (forward.kind === "delete_file") {
        const matches = before.filter(item => item.path === forward.path && item.kind === "file");
        if (matches.length !== 1) throw new Error("A deleted file could not be verified for recovery.");
        // The source is the last acknowledged server snapshot, not a cached
        // unsaved editor draft. Keep the exact text/base64 bytes in memory.
        return {kind:"restore_file",path:forward.path,entry:{...matches[0]}};
    }
    if (!result.trashId || !TRASH_TOKEN.test(result.trashId)) {
        throw new Error("Delete was acknowledged without a valid recovery token.");
    }
    return {kind:"restore_directory",path:forward.path,trashId:result.trashId};
}

function assertSignature(actual: string | null, expected: string | null): void {
    if (actual !== expected) {
        throw new Error("This folder or file changed in the terminal. Undo/Redo was blocked to protect newer content.");
    }
}

export class V6StructuralHistory {
    private past: Entry[] = [];
    private future: Entry[] = [];
    private busy = false;

    get canUndo(): boolean { return this.past.length > 0 && !this.busy; }
    get canRedo(): boolean { return this.future.length > 0 && !this.busy; }
    clear(): void { this.past = []; this.future = []; }

    /** Accept only the authoritative snapshot returned with a reconciled mutation. */
    recordReconciled(intent: WorkspaceExplorerIntentV6, result: WorkspaceExplorerResultV6,
        before: Snapshot): boolean {
        if (result.state !== "reconciliation_required" || !Array.isArray(result.files)) {
            this.clear(); return false;
        }
        return this.record(intent, result, before, result.files);
    }

    record(intent: WorkspaceExplorerIntentV6, result: WorkspaceExplorerResultV6,
        before: Snapshot, after: Snapshot): boolean {
        if (!supportsV6StructuralHistory(intent) || result.state !== "reconciliation_required") {
            this.clear(); return false;
        }
        const forward = intent as ReversibleIntent;
        const beforePath = intent.path;
        const afterPath = "destinationPath" in forward ? forward.destinationPath : forward.path;
        const beforeSignature = v6SubtreeSignature(before,beforePath);
        const afterSignature = v6SubtreeSignature(after,afterPath);
        // Require a complete, coherent before/after state; don't record an
        // uncertain operation as reversible.
        const isMove = forward.kind === "move_file" || forward.kind === "move_directory";
        const isTrash = forward.kind === "trash_directory";
        const isFileDelete = forward.kind === "delete_file";
        const coherent = isMove
            ? beforeSignature !== null && afterSignature !== null &&
              v6SubtreeSignature(before,afterPath) === null && v6SubtreeSignature(after,beforePath) === null
            : isTrash || isFileDelete ? beforeSignature !== null && afterSignature === null &&
              (!isFileDelete || before.filter(item => item.path === beforePath && item.kind === "file").length === 1)
            : forward.kind === "create_file" ? beforeSignature === null &&
              afterSignature === JSON.stringify([["", "text", ""]])
            : beforeSignature === null && afterSignature !== null;
        if (!coherent) { this.clear(); return false; }
        const inverse = reverseIntent(forward,result,before);
        this.past.push({forward,inverse,beforePath,afterPath,beforeSignature,afterSignature});
        if (this.past.length > HISTORY_LIMIT) this.past.shift();
        this.future = [];
        return true;
    }

    /** Server-acknowledged file writes join the SAME history as folder operations. */
    recordCommittedFiles(
        committed: ReadonlyArray<Readonly<{
            path:string;before:WorkspaceSyncEntry|null;after:WorkspaceSyncEntry|null;
        }>>,
        verified:Snapshot,
    ): boolean {
        if (this.busy) {this.clear();return false;}
        if (!committed.length) return true;
        if (committed.length > HISTORY_LIMIT) {this.clear();return false;}
        const candidates:Entry[]=[];
        for (const change of committed) {
            const {path,before,after} = change;
            if (!path || (!before && !after) ||
                (before && (before.kind !== "file" || before.path !== path)) ||
                (after && (after.kind !== "file" || after.path !== path))) {
                this.clear();return false;
            }
            const oldSignature = before ? v6SubtreeSignature([before],path) : null;
            const newSignature = after ? v6SubtreeSignature([after],path) : null;
            if (v6SubtreeSignature(verified,path) !== newSignature ||
                oldSignature === newSignature) {
                this.clear();return false;
            }
            const forward:ReversibleIntent = !after
                ? {kind:"delete_file",path}
                : !before ? {kind:"restore_file",path,entry:{...after}}
                : {kind:"replace_file",path,entry:{...after}};
            const inverse = before
                ? after ? {kind:"replace_file" as const,path,entry:{...before}}
                        : {kind:"restore_file" as const,path,entry:{...before}}
                : {kind:"delete_file" as const,path};
            candidates.push({forward,inverse,beforePath:path,afterPath:path,
                beforeSignature:oldSignature,afterSignature:newSignature});
        }
        this.past.push(...candidates);
        if (this.past.length > HISTORY_LIMIT) this.past.splice(0,this.past.length-HISTORY_LIMIT);
        this.future = [];
        return true;
    }

    async undo(executor: WorkspaceExplorerExecutorV6, snapshot: () => Promise<Snapshot>): Promise<void> {
        if (this.busy || !this.past.length) throw new Error("Nothing is ready to undo.");
        this.busy = true;
        const entry = this.past[this.past.length-1];
        try {
            assertSignature(v6SubtreeSignature(await snapshot(),entry.afterPath),entry.afterSignature);
            const result = await executor(entry.inverse);
            if (result.state !== "reconciliation_required" || !Array.isArray(result.files)) {
                throw new Error("Undo did not return a verified reconciled workspace snapshot.");
            }
            assertSignature(v6SubtreeSignature(result.files,entry.beforePath),entry.beforeSignature);
            this.past.pop(); this.future.push(entry);
        } catch (error) {
            // A failed transport can mean the server committed but the response
            // disappeared. Never retry automatically or trust the prior history.
            this.clear(); throw error;
        } finally { this.busy = false; }
    }

    async redo(executor: WorkspaceExplorerExecutorV6, snapshot: () => Promise<Snapshot>): Promise<void> {
        if (this.busy || !this.future.length) throw new Error("Nothing is ready to redo.");
        this.busy = true;
        const entry = this.future[this.future.length-1];
        try {
            assertSignature(v6SubtreeSignature(await snapshot(),entry.beforePath),entry.beforeSignature);
            const result = await executor(entry.forward);
            if (result.state !== "reconciliation_required" || !Array.isArray(result.files)) {
                throw new Error("Redo did not return a verified reconciled workspace snapshot.");
            }
            assertSignature(v6SubtreeSignature(result.files,entry.afterPath),entry.afterSignature);
            // Redoing a folder deletion creates a fresh protected trash token.
            const inverse = entry.forward.kind === "delete_file" ||
                entry.forward.kind === "restore_file" || entry.forward.kind === "replace_file"
                ? entry.inverse : reverseIntent(entry.forward,result,[]);
            this.future.pop();this.past.push({...entry,inverse});
        } catch (error) {
            this.clear();throw error;
        } finally { this.busy = false; }
    }
}
