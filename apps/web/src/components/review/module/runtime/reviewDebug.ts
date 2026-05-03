type AnyRecord = Record<string, any>;

export function isReviewDebugEnabled() {
  if (typeof window === "undefined") return false;

  try {
    const params = new URLSearchParams(window.location.search);

    return (
      params.get("debugReview") === "1" ||
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

export function getWorkspaceDebugCode(workspace: any) {
  if (!isWorkspaceLike(workspace)) return "";

  const entryId = workspace.entryFileId || workspace.activeFileId;
  const file = workspace.nodes.find(
    (node: any) => node?.kind === "file" && node.id === entryId,
  );

  return file?.kind === "file" ? String(file.content ?? "") : "";
}

export function summarizeWorkspace(workspace: any) {
  if (!isWorkspaceLike(workspace)) {
    return {
      hasWorkspace: false,
      code: "",
      stdin: "",
      language: "",
      entryFileId: "",
      activeFileId: "",
      fileCount: 0,
    };
  }

  const files = workspace.nodes.filter((node: any) => node?.kind === "file");

  return {
    hasWorkspace: true,
    code: getWorkspaceDebugCode(workspace),
    stdin: workspace.stdin ?? "",
    language: workspace.language ?? "",
    entryFileId: workspace.entryFileId ?? "",
    activeFileId: workspace.activeFileId ?? "",
    fileCount: files.length,
    files: files.map((file: any) => ({
      id: file.id,
      name: file.name,
      contentPreview: String(file.content ?? "").slice(0, 80),
    })),
  };
}

export function summarizePracticePatch(patch: any) {
  if (!patch) {
    return {
      exists: false,
      code: "",
      workspaceCode: "",
      hasWorkspace: false,
      keys: [],
    };
  }

  const workspace =
    patch.workspace ?? patch.codeWorkspace ?? patch.ideWorkspace ?? null;

  return {
    exists: true,
    code: typeof patch.code === "string" ? patch.code : "",
    source: typeof patch.source === "string" ? patch.source : "",
    stdin:
      typeof patch.codeStdin === "string"
        ? patch.codeStdin
        : typeof patch.stdin === "string"
          ? patch.stdin
          : "",
    lang:
      typeof patch.codeLang === "string"
        ? patch.codeLang
        : typeof patch.lang === "string"
          ? patch.lang
          : typeof patch.language === "string"
            ? patch.language
            : "",
    workspaceCode: getWorkspaceDebugCode(workspace),
    hasWorkspace: isWorkspaceLike(workspace),
    keys: Object.keys(patch),
  };
}

export function reviewDebug(label: string, payload?: AnyRecord) {
  if (!isReviewDebugEnabled()) return;

  try {
    console.groupCollapsed(`%c[ZOE REVIEW DEBUG] ${label}`, "color:#8b5cf6;font-weight:bold");
    if (payload) console.log(payload);
    console.groupEnd();
  } catch {
    console.log("[ZOE REVIEW DEBUG]", label, payload);
  }
}
