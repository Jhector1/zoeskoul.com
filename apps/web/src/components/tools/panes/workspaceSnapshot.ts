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

export type WorkspaceSubmitCache = {
    contextKey: string;
    workspace: WorkspaceStateV2 | null;
};

/**
 * Select the workspace that Check/submit must use.
 *
 * Monaco edits are kept local-first while the learner types. Flushing clears
 * `pendingWorkspaceRef` before React necessarily publishes the same workspace
 * back through `finalReviewWorkspace`. Keep the last workspace captured by the
 * submit bridge so the first Check click cannot fall back to the previous
 * rendered query.
 */
export function selectWorkspaceForSubmit(args: {
    contextKey: string;
    pendingWorkspace: WorkspaceStateV2 | null | undefined;
    lastFlushed: WorkspaceSubmitCache | null;
    currentWorkspace: WorkspaceStateV2 | null;
}): WorkspaceStateV2 | null {
    if (typeof args.pendingWorkspace !== "undefined") {
        return args.pendingWorkspace;
    }

    if (args.lastFlushed?.contextKey === args.contextKey) {
        return args.lastFlushed.workspace;
    }

    return args.currentWorkspace;
}
