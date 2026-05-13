import type { FileNode, WorkspaceStateV2 } from "@/components/ide/types";

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
    files: files.map((file) => ({
      id: file.id,
      name: file.name,
      parentId: file.parentId,
      contentLength: String(file.content ?? "").length,
      contentPreview: String(file.content ?? "").slice(0, 120),
    })),
  };
}
