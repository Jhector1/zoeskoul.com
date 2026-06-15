import type { FSNode, WorkspaceStateV2 } from "@/components/ide/types";
import type { IdeWorkspaceAccess } from "@/components/ide/workspaceHook/workspace.types";
import type { WorkspaceLanguage } from "@/lib/practice/types";

export type IdeFileActionsConfig = {
    enabled?: boolean;
    createFile?: boolean;
    createFolder?: boolean;
    rename?: boolean;
    delete?: boolean;
    dragDrop?: boolean;
};

export type ResolvedIdeFileActions = {
    enabled: boolean;
    createFile: boolean;
    createFolder: boolean;
    rename: boolean;
    delete: boolean;
    dragDrop: boolean;
};

export type IdeWorkspacePolicy = {
    canCreateFiles: boolean;
    canCreateFolders: boolean;
    canRenameNodes: boolean;
    canDeleteNodes: boolean;
    canMoveNodes: boolean;
    canUploadFiles: boolean;
    maxImportFiles: number;
    maxUploadFileBytes: number;
    maxWorkspaceBytes: number;
    maxNodes: number;
    maxFiles: number;
    maxDepth: number;
    maxFileContentBytes: number;
    maxStdinBytes: number;
};

export type ImportedWorkspaceFile = {
    path: string;
    content: string;
};

export const DEFAULT_WORKSPACE_FILE_CONTENT_BYTES = 1 * 1024 * 1024;
export const DEFAULT_WORKSPACE_STDIN_BYTES = 64 * 1024;
export const DEFAULT_IDE_FILE_ACTIONS: ResolvedIdeFileActions = {
    enabled: true,
    createFile: true,
    createFolder: true,
    rename: true,
    delete: true,
    dragDrop: true,
};

export function resolveIdeFileActions(
    config?: IdeFileActionsConfig | null,
): ResolvedIdeFileActions {
    const merged: ResolvedIdeFileActions = {
        ...DEFAULT_IDE_FILE_ACTIONS,
        ...(config ?? {}),
    };

    if (!merged.enabled) {
        return {
            enabled: false,
            createFile: false,
            createFolder: false,
            rename: false,
            delete: false,
            dragDrop: false,
        };
    }

    return merged;
}

export function bytesOfText(input: string) {
    return new TextEncoder().encode(String(input ?? "")).length;
}

export function resolveWorkspacePolicy(
    access: IdeWorkspaceAccess,
    lang: WorkspaceLanguage,
    fileActions?: IdeFileActionsConfig | null,
): IdeWorkspacePolicy {
    const resolvedFileActions = resolveIdeFileActions(fileActions);
    const applyFileActions = (policy: IdeWorkspacePolicy): IdeWorkspacePolicy => ({
        ...policy,
        canCreateFiles: policy.canCreateFiles && resolvedFileActions.createFile,
        canCreateFolders: policy.canCreateFolders && resolvedFileActions.createFolder,
        canRenameNodes: policy.canRenameNodes && resolvedFileActions.rename,
        canDeleteNodes: policy.canDeleteNodes && resolvedFileActions.delete,
        canMoveNodes: policy.canMoveNodes && resolvedFileActions.dragDrop,
        canUploadFiles: policy.canUploadFiles && resolvedFileActions.enabled,
    });

    if (!access.hasUser) {
        if (lang === "web" || lang === "sql") {
            return applyFileActions({
                canCreateFiles: false,
                canCreateFolders: false,
                canRenameNodes: false,
                canDeleteNodes: false,
                canMoveNodes: false,
                canUploadFiles: false,
                maxImportFiles: 0,
                maxUploadFileBytes: 0,
                maxWorkspaceBytes: 512 * 1024,
                maxNodes: 3,
                maxFiles: 3,
                maxDepth: 1,
                maxFileContentBytes: 256 * 1024,
                maxStdinBytes: 16 * 1024,
            });
        }

        return applyFileActions({
            canCreateFiles: false,
            canCreateFolders: false,
            canRenameNodes: false,
            canDeleteNodes: false,
            canMoveNodes: false,
            canUploadFiles: false,
            maxImportFiles: 0,
            maxUploadFileBytes: 0,
            maxWorkspaceBytes: 256 * 1024,
            maxNodes: 1,
            maxFiles: 1,
            maxDepth: 1,
            maxFileContentBytes: 256 * 1024,
            maxStdinBytes: 16 * 1024,
        });
    }

    if (!access.canUseMultiFile) {
        return applyFileActions({
            canCreateFiles: true,
            canCreateFolders: false,
            canRenameNodes: true,
            canDeleteNodes: false,
            canMoveNodes: false,
            canUploadFiles: true,
            maxImportFiles: 1,
            maxUploadFileBytes: 512 * 1024,
            maxWorkspaceBytes: 512 * 1024,
            maxNodes: 1,
            maxFiles: 1,
            maxDepth: 1,
            maxFileContentBytes: 512 * 1024,
            maxStdinBytes: 32 * 1024,
        });
    }

    return applyFileActions({
        canCreateFiles: true,
        canCreateFolders: true,
        canRenameNodes: true,
        canDeleteNodes: true,
        canMoveNodes: true,
        canUploadFiles: true,
        maxImportFiles: 20,
        maxUploadFileBytes: 1 * 1024 * 1024,
        maxWorkspaceBytes: 5 * 1024 * 1024,
        maxNodes: 250,
        maxFiles: 150,
        maxDepth: 8,
        maxFileContentBytes: DEFAULT_WORKSPACE_FILE_CONTENT_BYTES,
        maxStdinBytes: DEFAULT_WORKSPACE_STDIN_BYTES,
    });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

function nodeDepthMap(nodes: FSNode[]) {
    const byId = new Map(nodes.map((node) => [node.id, node] as const));
    const memo = new Map<string, number>();

    function depthOf(id: string): number {
        const cached = memo.get(id);
        if (cached != null) return cached;

        const node = byId.get(id);
        if (!node) return 0;
        if (!node.parentId) {
            memo.set(id, 1);
            return 1;
        }

        const depth = 1 + depthOf(node.parentId);
        memo.set(id, depth);
        return depth;
    }

    for (const node of nodes) depthOf(node.id);
    return memo;
}

export function estimateWorkspaceUsage(nodes: FSNode[]) {
    const fileNodes = nodes.filter(
        (node): node is Extract<FSNode, { kind: "file" }> => node.kind === "file",
    );
    const totalBytes = fileNodes.reduce(
        (sum, file) => sum + bytesOfText(file.content ?? ""),
        0,
    );
    const maxDepth = Math.max(0, ...Array.from(nodeDepthMap(nodes).values()));

    return {
        nodeCount: nodes.length,
        fileCount: fileNodes.length,
        totalBytes,
        maxDepth,
    };
}

export function validateWorkspaceNodes(
    nodes: FSNode[],
    policy: IdeWorkspacePolicy,
): string | null {
    const usage = estimateWorkspaceUsage(nodes);

    if (usage.nodeCount > policy.maxNodes) {
        return `Workspace limit reached: max ${policy.maxNodes} nodes.`;
    }

    if (usage.fileCount > policy.maxFiles) {
        return `Workspace limit reached: max ${policy.maxFiles} files.`;
    }

    if (usage.maxDepth > policy.maxDepth) {
        return `Workspace limit reached: max depth ${policy.maxDepth}.`;
    }

    if (usage.totalBytes > policy.maxWorkspaceBytes) {
        return `Workspace limit reached: max ${(policy.maxWorkspaceBytes / 1024 / 1024).toFixed(1)} MB total content.`;
    }

    return null;
}

export function validateImportedFiles(
    files: ImportedWorkspaceFile[],
    policy: IdeWorkspacePolicy,
): string | null {
    if (!policy.canUploadFiles) {
        return "Uploading files is not available for this user.";
    }

    if (!files.length) {
        return "No files were selected.";
    }

    if (files.length > policy.maxImportFiles) {
        return `You can import up to ${policy.maxImportFiles} file${policy.maxImportFiles === 1 ? "" : "s"} at a time.`;
    }

    for (const file of files) {
        const size = bytesOfText(file.content ?? "");
        if (size > policy.maxUploadFileBytes) {
            return `${file.path || "File"} exceeds the ${(policy.maxUploadFileBytes / 1024 / 1024).toFixed(1)} MB upload limit.`;
        }
    }

    const totalImportBytes = files.reduce(
        (sum, file) => sum + bytesOfText(file.content ?? ""),
        0,
    );

    if (totalImportBytes > policy.maxWorkspaceBytes) {
        return `Imported content exceeds the ${(policy.maxWorkspaceBytes / 1024 / 1024).toFixed(1)} MB workspace limit.`;
    }

    return null;
}

export function validateWorkspaceState(
    workspace: unknown,
    policy: IdeWorkspacePolicy,
): string[] {
    if (!isPlainObject(workspace)) {
        return ["Workspace must be an object."];
    }

    if (workspace.version !== 2) {
        return ["Workspace version must be 2."];
    }

    if (!Array.isArray(workspace.nodes)) {
        return ["Workspace nodes must be an array."];
    }

    if (typeof workspace.language !== "string" || !workspace.language.trim()) {
        return ["Workspace language must be a non-empty string."];
    }

    if (!Array.isArray(workspace.openTabs)) {
        return ["Workspace openTabs must be an array."];
    }

    if (!Array.isArray(workspace.expanded)) {
        return ["Workspace expanded must be an array."];
    }

    if (typeof workspace.activeFileId !== "string" || !workspace.activeFileId.trim()) {
        return ["Workspace activeFileId must be a non-empty string."];
    }

    if (typeof workspace.entryFileId !== "string" || !workspace.entryFileId.trim()) {
        return ["Workspace entryFileId must be a non-empty string."];
    }

    if (typeof workspace.stdin !== "string") {
        return ["Workspace stdin must be a string."];
    }

    const stdinBytes = bytesOfText(workspace.stdin);
    if (stdinBytes > policy.maxStdinBytes) {
        return [`Workspace stdin exceeds the ${policy.maxStdinBytes} byte limit.`];
    }

    const nodeIds = new Set<string>();
    const fileIds = new Set<string>();
    const folderIds = new Set<string>();
    const nodes = workspace.nodes as unknown[];

    for (let index = 0; index < nodes.length; index += 1) {
        const node = nodes[index];
        if (!isPlainObject(node)) {
            return [`Workspace node ${index} must be an object.`];
        }

        const id = node.id;
        if (typeof id !== "string" || !id.trim()) {
            return [`Workspace node ${index} is missing a valid id.`];
        }

        if (nodeIds.has(id)) {
            return [`Workspace node id "${id}" is duplicated.`];
        }
        nodeIds.add(id);

        if (node.kind !== "file" && node.kind !== "folder") {
            return [`Workspace node "${id}" has an invalid kind.`];
        }

        if (typeof node.name !== "string" || !node.name.trim()) {
            return [`Workspace node "${id}" is missing a valid name.`];
        }

        if (node.parentId != null && (typeof node.parentId !== "string" || !node.parentId.trim())) {
            return [`Workspace node "${id}" has an invalid parentId.`];
        }

        if (typeof node.createdAt !== "number" || !Number.isFinite(node.createdAt)) {
            return [`Workspace node "${id}" has an invalid createdAt.`];
        }

        if (typeof node.updatedAt !== "number" || !Number.isFinite(node.updatedAt)) {
            return [`Workspace node "${id}" has an invalid updatedAt.`];
        }

        if (node.kind === "file") {
            if (typeof node.content !== "string") {
                return [`Workspace file "${id}" content must be a string.`];
            }

            const contentBytes = bytesOfText(node.content);
            if (contentBytes > policy.maxFileContentBytes) {
                return [`Workspace file "${id}" exceeds the ${policy.maxFileContentBytes} byte limit.`];
            }

            fileIds.add(id);
        } else {
            folderIds.add(id);
        }
    }

    for (const node of nodes as Array<Record<string, unknown>>) {
        if (node.parentId == null) continue;
        if (!folderIds.has(String(node.parentId))) {
            return [`Workspace node "${String(node.id)}" references a missing folder parent.`];
        }
    }

    for (const id of workspace.openTabs as unknown[]) {
        if (typeof id !== "string" || !fileIds.has(id)) {
            return ["Workspace openTabs must only reference file ids."];
        }
    }

    for (const id of workspace.expanded as unknown[]) {
        if (typeof id !== "string" || !nodeIds.has(id)) {
            return ["Workspace expanded must only reference existing node ids."];
        }
    }

    if (!fileIds.has(workspace.activeFileId)) {
        return ["Workspace activeFileId must reference an existing file."];
    }

    if (!fileIds.has(workspace.entryFileId)) {
        return ["Workspace entryFileId must reference an existing file."];
    }

    const limitError = validateWorkspaceNodes(workspace.nodes as FSNode[], policy);
    if (limitError) return [limitError];

    return [];
}
