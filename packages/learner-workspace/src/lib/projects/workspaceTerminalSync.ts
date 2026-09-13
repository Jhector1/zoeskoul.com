import type { WorkspaceStateV2 } from "@zoeskoul/learner-workspace/ide/types";
import type { WorkspaceSyncEntry } from "@zoeskoul/code-contracts";
import { mergeTerminalSnapshotIntoWorkspace } from "@zoeskoul/learner-workspace/lib/projects/mergeTerminalSnapshotIntoWorkspace";

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
