export function reviewSaveDebug(label: string, data: Record<string, any> = {}) {
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

export function summarizeWorkspaceForSave(workspace: any) {
  const nodes = Array.isArray(workspace?.nodes) ? workspace.nodes : [];
  const files = nodes.filter((node: any) => node?.kind === "file");

  return {
    version: workspace?.version,
    language: workspace?.language,
    stdinLength: String(workspace?.stdin ?? "").length,
    fileCount: files.length,
    activeFileId: workspace?.activeFileId,
    entryFileId: workspace?.entryFileId,
    openTabs: Array.isArray(workspace?.openTabs) ? workspace.openTabs : [],
    files: files.map((file: any) => ({
      id: file?.id,
      name: file?.name,
      parentId: file?.parentId,
      contentLength: String(file?.content ?? "").length,
      contentPreview: String(file?.content ?? "").slice(0, 120),
    })),
  };
}
