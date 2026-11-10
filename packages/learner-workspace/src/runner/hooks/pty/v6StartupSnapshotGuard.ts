import type { WorkspaceSyncEntry } from "@zoeskoul/learner-workspace/runner/runtime";
import { isWorkspaceInternalPath } from "@zoeskoul/learner-workspace/lib/projects/workspaceInternalPaths";
import {
    sortWorkspaceSyncEntries,
    workspaceSyncEntriesEqual,
    workspaceSyncEntryValue,
} from "@zoeskoul/learner-workspace/lib/projects/workspaceSyncEntries";

// Only the user-visible workspace is comparable. Runner snapshots omit
// runtime control-plane paths and the terminal history sidecar is client-only.
function comparable(files: WorkspaceSyncEntry[]): WorkspaceSyncEntry[] {
    return sortWorkspaceSyncEntries(files.filter((entry) => {
        if (isWorkspaceInternalPath(entry.path)) return false;
        return entry.path.split("/").filter(Boolean).at(-1) !== ".bash_history";
    }));
}

export function verifyV6StartupSnapshot(args: {
    expected: WorkspaceSyncEntry[];
    actual: WorkspaceSyncEntry[];
}): {ok: true; divergentPaths: []} | {
    ok: false;
    reason: "workspace_mismatch";
    divergentPaths: string[];
} {
    const expected = comparable(args.expected);
    const actual = comparable(args.actual);
    if (workspaceSyncEntriesEqual(expected, actual)) return {ok:true, divergentPaths: []};
    const left = new Map(expected.map((entry) => [entry.path, workspaceSyncEntryValue(entry)]));
    const right = new Map(actual.map((entry) => [entry.path, workspaceSyncEntryValue(entry)]));
    const divergentPaths = [...new Set([...left.keys(), ...right.keys()])]
        .filter((path) => left.get(path) !== right.get(path)).sort();
    return {ok:false, reason:"workspace_mismatch", divergentPaths};
}
