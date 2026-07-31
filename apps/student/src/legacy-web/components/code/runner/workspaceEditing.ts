import type { WorkspaceStateV2 } from "@/components/ide/types";

function isExistingWorkspaceFileId(
    workspace: WorkspaceStateV2 | null | undefined,
    fileId: string | null | undefined,
) {
    if (!workspace || workspace.version !== 2 || !Array.isArray(workspace.nodes) || !fileId) {
        return false;
    }

    return workspace.nodes.some(
        (node) => node.kind === "file" && node.id === fileId && !node.binary,
    );
}

export function resolveEditableWorkspaceFileId(
    workspace: WorkspaceStateV2 | null | undefined,
    preferredFileId?: string | null,
) {
    if (!workspace || workspace.version !== 2 || !Array.isArray(workspace.nodes)) {
        return null;
    }

    if (isExistingWorkspaceFileId(workspace, preferredFileId)) {
        return String(preferredFileId);
    }

    if (isExistingWorkspaceFileId(workspace, workspace.activeFileId)) {
        return workspace.activeFileId;
    }

    if (isExistingWorkspaceFileId(workspace, workspace.entryFileId)) {
        return workspace.entryFileId;
    }

    return workspace.nodes.find((node) => node.kind === "file" && !node.binary)?.id ?? null;
}
