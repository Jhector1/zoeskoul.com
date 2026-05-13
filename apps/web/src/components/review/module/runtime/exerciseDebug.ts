import type { FileNode, WorkspaceStateV2 } from "@/components/ide/types";

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
    (value as WorkspaceStateV2).version === 2 &&
    Array.isArray((value as WorkspaceStateV2).nodes)
  );
}

export function getExerciseWorkspaceCode(workspace: unknown) {
  if (!isWorkspaceLike(workspace)) return null;
  const safeWorkspace = workspace as WorkspaceStateV2;

  const entryId = safeWorkspace.entryFileId || safeWorkspace.activeFileId;
  const file = safeWorkspace.nodes.find(
    (node) => node.kind === "file" && node.id === entryId,
  );

  return file?.kind === "file" ? String(file.content ?? "") : null;
}

export function summarizeExerciseWorkspace(workspace: unknown) {
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
  const safeWorkspace = workspace as WorkspaceStateV2;

  const files = safeWorkspace.nodes
    .filter((node): node is FileNode => node.kind === "file")
    .map((node) => ({
      id: node.id,
      name: node.name,
      contentPreview: String(node.content ?? "").slice(0, 120),
    }));

  return {
    hasWorkspace: true,
    code: getExerciseWorkspaceCode(workspace),
    stdin: safeWorkspace.stdin ?? "",
    language: safeWorkspace.language ?? "",
    entryFileId: safeWorkspace.entryFileId ?? "",
    activeFileId: safeWorkspace.activeFileId ?? "",
    fileCount: files.length,
    files,
  };
}

export function summarizeExercisePatch(patch: unknown) {
  if (!patch || typeof patch !== "object") {
    return {
      exists: false,
      code: null,
      workspaceCode: null,
      hasWorkspace: false,
      keys: [],
    };
  }

  const patchRecord = patch as Record<string, unknown>;
  const workspace =
    patchRecord.workspace ?? patchRecord.codeWorkspace ?? patchRecord.ideWorkspace ?? null;

  return {
    exists: true,
    code: typeof patchRecord.code === "string" ? patchRecord.code : null,
    source: typeof patchRecord.source === "string" ? patchRecord.source : null,
    codeStdin:
      typeof patchRecord.codeStdin === "string"
        ? patchRecord.codeStdin
        : typeof patchRecord.stdin === "string"
          ? patchRecord.stdin
          : "",
    codeLang:
      typeof patchRecord.codeLang === "string"
        ? patchRecord.codeLang
        : typeof patchRecord.lang === "string"
          ? patchRecord.lang
          : typeof patchRecord.language === "string"
            ? patchRecord.language
            : "",
    hasWorkspace: isWorkspaceLike(workspace),
    workspaceCode: getExerciseWorkspaceCode(workspace),
    keys: Object.keys(patchRecord),
  };
}

export function exerciseDebug(
  label: string,
  payload?: Record<string, unknown>,
) {
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
