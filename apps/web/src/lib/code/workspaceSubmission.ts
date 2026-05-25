import type { WorkspaceStateV2 } from "@/components/ide/types";
import { exportProjectFiles, relativeProjectPathOf } from "@/components/ide/fsTree";
import type { FileEntry } from "@/lib/code/types";

export type WorkspaceCodeSubmission = {
    entry: string;
    files: FileEntry[];
};

function isWorkspaceState(value: unknown): value is WorkspaceStateV2 {
    return Boolean(value) && (value as WorkspaceStateV2).version === 2 && Array.isArray((value as WorkspaceStateV2).nodes);
}

export function serializeWorkspaceForCodeRun(
    workspace: WorkspaceStateV2 | null | undefined,
): WorkspaceCodeSubmission | null {
    if (!isWorkspaceState(workspace)) return null;

    const files = exportProjectFiles(workspace.nodes);
    if (!files.length) return null;

    const preferredId = workspace.entryFileId || workspace.activeFileId;
    const entryNode =
        workspace.nodes.find((node) => node.kind === "file" && node.id === preferredId) ??
        workspace.nodes.find((node) => node.kind === "file");

    if (!entryNode || entryNode.kind !== "file") return null;

    const entry = relativeProjectPathOf(workspace.nodes, entryNode.id);
    if (!entry) return null;

    return {
        entry,
        files,
    };
}

export function replaceEntryFileContent(args: {
    entry: string;
    files: FileEntry[];
    content: string;
}): FileEntry[] {
    const nextFiles = args.files.map((file) =>
        file.path === args.entry
            ? {
                path: file.path,
                content: args.content,
              }
            : file,
    );

    if (nextFiles.some((file) => file.path === args.entry)) {
        return nextFiles;
    }

    return [
        ...nextFiles,
        {
            path: args.entry,
            content: args.content,
        },
    ];
}
