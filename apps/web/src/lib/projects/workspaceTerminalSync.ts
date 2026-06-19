import type { WorkspaceStateV2 } from "@/components/ide/types";
import { mergeTerminalSnapshotIntoWorkspace } from "@/lib/projects/mergeTerminalSnapshotIntoWorkspace";

export type TerminalSnapshotFile =
    | {
          path: string;
          content: string;
          kind?: "file";
      }
    | {
          kind: "directory";
          path: string;
      };

export function mergeWorkspaceWithTerminalSnapshot(args: {
    prior: WorkspaceStateV2;
    files: TerminalSnapshotFile[];
}): WorkspaceStateV2 {
    return mergeTerminalSnapshotIntoWorkspace({
        prior: args.prior,
        snapshotFiles: args.files,
    });
}
