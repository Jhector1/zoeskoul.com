import type { WorkspaceStateV2 } from "@/components/ide/types";
import type { WorkspaceSyncEntry } from "@zoeskoul/code-contracts";
import { mergeTerminalSnapshotIntoWorkspace } from "@/lib/projects/mergeTerminalSnapshotIntoWorkspace";

export type TerminalSnapshotFile = WorkspaceSyncEntry;

export function mergeWorkspaceWithTerminalSnapshot(args: {
    prior: WorkspaceStateV2;
    files: TerminalSnapshotFile[];
}): WorkspaceStateV2 {
    return mergeTerminalSnapshotIntoWorkspace({
        prior: args.prior,
        snapshotFiles: args.files,
    });
}
