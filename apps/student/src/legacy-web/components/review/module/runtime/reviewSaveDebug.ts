import type { FileNode, WorkspaceStateV2 } from "@/components/ide/types";

function debugWorkspaceFileLength(
  workspace: Partial<WorkspaceStateV2> | null,
  path: string,
) {
  const nodes = Array.isArray(workspace?.nodes) ? workspace.nodes : [];
  const folderPathById = new Map<string, string>();
  let changed = true;

  while (changed) {
    changed = false;
    for (const node of nodes) {
      if (node?.kind !== "folder") continue;
      if (folderPathById.has(String(node.id))) continue;
      const parentPath =
        node.parentId == null
          ? ""
          : folderPathById.has(String(node.parentId))
            ? folderPathById.get(String(node.parentId)) ?? ""
            : null;
      if (parentPath == null) continue;
      folderPathById.set(
        String(node.id),
        parentPath ? `${parentPath}/${String(node.name ?? "")}` : String(node.name ?? ""),
      );
      changed = true;
    }
  }

  const file = nodes.find((node) => {
    if (node?.kind !== "file") return false;
    const parentPath =
      node.parentId == null ? "" : folderPathById.get(String(node.parentId)) ?? "";
    const fullPath = parentPath
      ? `${parentPath}/${String(node.name ?? "")}`
      : String(node.name ?? "");
    return fullPath === path;
  }) as FileNode | undefined;

  return file ? String(file.content ?? "").length : null;
}

export function reviewSaveDebug(
  label: string,
  data: Record<string, unknown> = {},
) {
  try {
    if (typeof window !== "undefined") {
      const enabled =
        window.localStorage.getItem("zoe:debug:review-save") === "1" ||
        window.localStorage.getItem("zoe:debug:starter-files") === "1";

      if (!enabled) return;
    } else if (process.env.NODE_ENV === "production") {
      return;
    }
  } catch {
    return;
  }

  console.log(`[review-save-debug] ${label}`, {
    at: new Date().toISOString(),
    ...data,
  });
}

export function summarizeWorkspaceForSave(workspace: unknown) {
  const workspaceLike =
    typeof workspace === "object" && workspace !== null
      ? (workspace as Partial<WorkspaceStateV2>)
      : null;
  const safeWorkspace = workspaceLike as Partial<WorkspaceStateV2> | null;
  const nodes = Array.isArray(safeWorkspace?.nodes) ? safeWorkspace.nodes : [];
  const files = nodes.filter((node): node is FileNode => node.kind === "file");

  return {
    version: safeWorkspace?.version,
    language: safeWorkspace?.language,
    stdinLength: String(safeWorkspace?.stdin ?? "").length,
    fileCount: files.length,
    activeFileId: safeWorkspace?.activeFileId,
    entryFileId: safeWorkspace?.entryFileId,
    openTabs: Array.isArray(safeWorkspace?.openTabs) ? safeWorkspace.openTabs : [],
    mainPyLength: debugWorkspaceFileLength(safeWorkspace, "main.py"),
    carPyLength: debugWorkspaceFileLength(safeWorkspace, "models/car.py"),
    files: files.map((file) => ({
      id: file.id,
      name: file.name,
      parentId: file.parentId,
      contentLength: String(file.content ?? "").length,
      contentPreview: String(file.content ?? "").slice(0, 120),
    })),
  };
}
