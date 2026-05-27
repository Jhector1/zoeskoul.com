import type { WorkspaceStateV2 } from "@/components/ide/types";
import { deriveEntryCode } from "@/components/review/module/runtime/exerciseWorkspaceResolver";

export function extractRuntimeSnapshotFromWorkspace(
    workspace: WorkspaceStateV2 | null,
) {
    if (!workspace) {
        return {
            code: "",
            stdin: "",
        };
    }

    return {
        /**
         * Runtime/progress treat `code` as the entry file source when a workspace
         * exists. Never derive it from the active tab, or opening output.txt can
         * feed that content back into main.py during the next runtime hydration.
         */
        code: deriveEntryCode(workspace) ?? "",
        stdin: workspace.stdin ?? "",
    };
}
