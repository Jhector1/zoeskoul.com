import type { WorkspaceStateV2 } from "@zoeskoul/learner-workspace/ide/types";

/**
 * The cloud baseline represents learner-authored contents, not browser-local
 * node IDs, timestamps or pane layout. Rehydration and Runner reconciliation
 * may allocate fresh node IDs for exactly the same filesystem.
 *
 * Paths are resolved through the parent tree, so a rename, move or changed
 * entry file remains a meaningful edit. Invalid/ambiguous trees are marked
 * as non-verifiable; they must never be accepted as a clean cloud baseline.
 */
export const INVALID_CLOUD_FINGERPRINT_PREFIX = "invalid-cloud-workspace:";

export function cloudWorkspaceFingerprint(
    workspace: WorkspaceStateV2 | null | undefined,
): string {
    if (!workspace) return "null";

    const byId = new Map(workspace.nodes.map((node) => [node.id, node]));
    const pathById = new Map<string, string>();
    const visiting = new Set<string>();
    let valid = byId.size === workspace.nodes.length;

    const pathFor = (id: string): string | null => {
        if (pathById.has(id)) return pathById.get(id)!;
        const node = byId.get(id);
        if (!node || visiting.has(id) || typeof node.name !== "string" ||
            !node.name || node.name === "." || node.name === ".." ||
            /[\/\\\0]/.test(node.name)) {
            valid = false;
            return null;
        }
        visiting.add(id);
        let parent = "";
        if (node.parentId !== null) {
            const parentNode = byId.get(node.parentId);
            if (!parentNode || parentNode.kind !== "folder") {
                valid = false;
            } else {
                parent = pathFor(node.parentId) ?? "";
                if (!parent) valid = false;
            }
        }
        visiting.delete(id);
        if (!valid) return null;
        const path = parent ? `${parent}/${node.name}` : node.name;
        pathById.set(id, path);
        return path;
    };

    const entries = workspace.nodes.map((node) => {
        const path = pathFor(node.id);
        if (!path) valid = false;
        return node.kind === "folder"
            ? { path, kind: "folder" as const }
            : {
                path,
                kind: "file" as const,
                content: node.binary ? "" : node.content ?? "",
                binary: node.binary
                    ? {
                        encoding: node.binary.encoding,
                        data: node.binary.data,
                        mimeType: node.binary.mimeType,
                        sizeBytes: node.binary.sizeBytes,
                    }
                    : null,
            };
    });
    entries.sort((a, b) => String(a.path).localeCompare(String(b.path)) || a.kind.localeCompare(b.kind));
    const unique = new Set(entries.map((entry) => entry.path));
    if (unique.size !== entries.length) valid = false;

    const entryNode = byId.get(workspace.entryFileId);
    const entryPath = entryNode?.kind === "file" ? pathFor(entryNode.id) : null;
    if (!entryPath) valid = false;

    if (!valid) {
        // Do not collapse corrupted/cyclic trees to a plausible filesystem.
        // Identical invalid inputs must still be rejected by cloud verification.
        return INVALID_CLOUD_FINGERPRINT_PREFIX + JSON.stringify(workspace);
    }

    return JSON.stringify({
        version: workspace.version,
        language: workspace.language,
        entries,
        entryPath,
        stdin: workspace.stdin ?? "",
    });
}
