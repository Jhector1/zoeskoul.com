import type { FileNode, WorkspaceStateV2 } from "@/components/ide/types";

type UnknownRecord = Record<string, unknown>;

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
    (value as WorkspaceStateV2).version === 2 &&
    Array.isArray((value as WorkspaceStateV2).nodes)
  );
}

export function getWorkspaceDebugCode(workspace: unknown) {
  if (!isWorkspaceLike(workspace)) return "";
  const safeWorkspace = workspace as WorkspaceStateV2;

  const entryId = safeWorkspace.entryFileId || safeWorkspace.activeFileId;
  const file = safeWorkspace.nodes.find(
    (node) => node.kind === "file" && node.id === entryId,
  );

  return file?.kind === "file" ? String(file.content ?? "") : "";
}

export function summarizeWorkspace(workspace: unknown) {
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
  const safeWorkspace = workspace as WorkspaceStateV2;

  const files = safeWorkspace.nodes.filter(
    (node): node is FileNode => node.kind === "file",
  );

  return {
    hasWorkspace: true,
    code: getWorkspaceDebugCode(workspace),
    stdin: safeWorkspace.stdin ?? "",
    language: safeWorkspace.language ?? "",
    entryFileId: safeWorkspace.entryFileId ?? "",
    activeFileId: safeWorkspace.activeFileId ?? "",
    fileCount: files.length,
    files: files.map((file) => ({
      id: file.id,
      name: file.name,
      contentPreview: String(file.content ?? "").slice(0, 80),
    })),
  };
}

export function summarizePracticePatch(patch: unknown) {
  if (!patch || typeof patch !== "object") {
    return {
      exists: false,
      code: "",
      workspaceCode: "",
      hasWorkspace: false,
      keys: [],
    };
  }

  const patchRecord = patch as UnknownRecord;
  const workspace =
    patchRecord.workspace ?? patchRecord.codeWorkspace ?? patchRecord.ideWorkspace ?? null;

  return {
    exists: true,
    code: typeof patchRecord.code === "string" ? patchRecord.code : "",
    source: typeof patchRecord.source === "string" ? patchRecord.source : "",
    stdin:
      typeof patchRecord.codeStdin === "string"
        ? patchRecord.codeStdin
        : typeof patchRecord.stdin === "string"
          ? patchRecord.stdin
          : "",
    lang:
      typeof patchRecord.codeLang === "string"
        ? patchRecord.codeLang
        : typeof patchRecord.lang === "string"
          ? patchRecord.lang
          : typeof patchRecord.language === "string"
            ? patchRecord.language
            : "",
    workspaceCode: getWorkspaceDebugCode(workspace),
    hasWorkspace: isWorkspaceLike(workspace),
    keys: Object.keys(patchRecord),
  };
}

export function reviewDebug(label: string, payload?: UnknownRecord) {
  if (!isReviewDebugEnabled()) return;

  try {
    console.groupCollapsed(`%c[ZOE REVIEW DEBUG] ${label}`, "color:#8b5cf6;font-weight:bold");
    if (payload) console.log(payload);
    console.groupEnd();
  } catch {
    console.log("[ZOE REVIEW DEBUG]", label, payload);
  }
}
