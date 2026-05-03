export function isExerciseDebugEnabled() {
  if (typeof window === "undefined") return false;

  try {
    const params = new URLSearchParams(window.location.search);

    return (
      params.get("debugExercise") === "1" ||
      window.localStorage.getItem("zoe:debugExercise") === "1" ||
      window.localStorage.getItem("zoe:debugReview") === "1"
    );
  } catch {
    return false;
  }
}

export function isWorkspaceLike(value: unknown) {
  return (
    !!value &&
    typeof value === "object" &&
    (value as any).version === 2 &&
    Array.isArray((value as any).nodes)
  );
}

export function getExerciseWorkspaceCode(workspace: any) {
  if (!isWorkspaceLike(workspace)) return null;

  const entryId = workspace.entryFileId || workspace.activeFileId;
  const file = workspace.nodes.find(
    (node: any) => node?.kind === "file" && node.id === entryId,
  );

  return file?.kind === "file" ? String(file.content ?? "") : null;
}

export function summarizeExerciseWorkspace(workspace: any) {
  if (!isWorkspaceLike(workspace)) {
    return {
      hasWorkspace: false,
      code: null,
      stdin: "",
      language: "",
      entryFileId: "",
      activeFileId: "",
      files: [],
    };
  }

  const files = workspace.nodes
    .filter((node: any) => node?.kind === "file")
    .map((node: any) => ({
      id: node.id,
      name: node.name,
      contentPreview: String(node.content ?? "").slice(0, 120),
    }));

  return {
    hasWorkspace: true,
    code: getExerciseWorkspaceCode(workspace),
    stdin: workspace.stdin ?? "",
    language: workspace.language ?? "",
    entryFileId: workspace.entryFileId ?? "",
    activeFileId: workspace.activeFileId ?? "",
    fileCount: files.length,
    files,
  };
}

export function summarizeExercisePatch(patch: any) {
  if (!patch) {
    return {
      exists: false,
      code: null,
      workspaceCode: null,
      hasWorkspace: false,
      keys: [],
    };
  }

  const workspace =
    patch.workspace ?? patch.codeWorkspace ?? patch.ideWorkspace ?? null;

  return {
    exists: true,
    code: typeof patch.code === "string" ? patch.code : null,
    source: typeof patch.source === "string" ? patch.source : null,
    codeStdin:
      typeof patch.codeStdin === "string"
        ? patch.codeStdin
        : typeof patch.stdin === "string"
          ? patch.stdin
          : "",
    codeLang:
      typeof patch.codeLang === "string"
        ? patch.codeLang
        : typeof patch.lang === "string"
          ? patch.lang
          : typeof patch.language === "string"
            ? patch.language
            : "",
    hasWorkspace: isWorkspaceLike(workspace),
    workspaceCode: getExerciseWorkspaceCode(workspace),
    keys: Object.keys(patch),
  };
}

export function exerciseDebug(label: string, payload?: Record<string, any>) {
  if (!isExerciseDebugEnabled()) return;

  try {
    console.groupCollapsed(
      `%c[ZOE EXERCISE DEBUG] ${label}`,
      "color:#059669;font-weight:bold",
    );
    if (payload) console.log(payload);
    console.groupEnd();
  } catch {
    console.log("[ZOE EXERCISE DEBUG]", label, payload);
  }
}
