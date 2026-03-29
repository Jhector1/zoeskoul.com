
import type { FSNode } from "../types";
import type { IdeWorkspaceAccess } from "./workspace.types";

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
};

export type ImportedWorkspaceFile = {
    path: string;
    content: string;
};

export function bytesOfText(input: string) {
    return new TextEncoder().encode(String(input ?? "")).length;
}

export function resolveWorkspacePolicy(
    access: IdeWorkspaceAccess,
): IdeWorkspacePolicy {
    if (!access.hasUser) {
        return {
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
        };
    }

    if (!access.canUseMultiFile) {
        return {
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
        };
    }

    return {
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
    };
}

function nodeDepthMap(nodes: FSNode[]) {
    const byId = new Map(nodes.map((n) => [n.id, n] as const));
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

    for (const n of nodes) depthOf(n.id);
    return memo;
}

export function estimateWorkspaceUsage(nodes: FSNode[]) {
    const fileNodes = nodes.filter(
        (n): n is Extract<FSNode, { kind: "file" }> => n.kind === "file",
    );
    const totalBytes = fileNodes.reduce(
        (sum, f) => sum + bytesOfText(f.content ?? ""),
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
        (sum, f) => sum + bytesOfText(f.content ?? ""),
        0,
    );

    if (totalImportBytes > policy.maxWorkspaceBytes) {
        return `Imported content exceeds the ${(policy.maxWorkspaceBytes / 1024 / 1024).toFixed(1)} MB workspace limit.`;
    }

    return null;
}