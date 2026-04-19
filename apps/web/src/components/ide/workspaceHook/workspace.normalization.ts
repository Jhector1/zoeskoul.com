import type { WorkspaceLanguage } from "@/lib/practice/types";

import type { FileNode, FSNode, WorkspaceStateV2 } from "../types";
import type { IdeWorkspaceAccess } from "./workspace.types";
import { uid } from "../utils";
import { defaultExt } from "../languageDefaults";
import { buildDefaultWorkspace } from "../storage";

export function createDefaultStateForLanguage(lang: WorkspaceLanguage): WorkspaceStateV2 {
  return buildDefaultWorkspace(lang);
}

export function buildSingleFileWorkspace(
    lang: WorkspaceLanguage,
    source?: WorkspaceStateV2 | null,
): WorkspaceStateV2 {
  const seed = buildDefaultWorkspace(lang);

  const seedMain =
      seed.nodes.find((n): n is FileNode => n.kind === "file") ??
      ({
        id: uid(),
        kind: "file",
        name: `main${defaultExt(lang)}`,
        parentId: null,
        content: "",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } satisfies FileNode);

  const sourceFile =
      source?.nodes.find((n): n is FileNode => n.kind === "file" && n.id === source.activeFileId) ??
      source?.nodes.find((n): n is FileNode => n.kind === "file" && n.id === source.entryFileId) ??
      source?.nodes.find((n): n is FileNode => n.kind === "file") ??
      null;

  const file: FileNode = {
    id: seedMain.id,
    kind: "file",
    name: seedMain.name,
    parentId: null,
    content: sourceFile?.content ?? seedMain.content ?? "",
    createdAt: seedMain.createdAt ?? Date.now(),
    updatedAt: Date.now(),
  };

  return {
    version: 2,
    language: lang,
    nodes: [file],
    openTabs: [file.id],
    activeFileId: file.id,
    entryFileId: file.id,
    stdin: source?.stdin ?? "",
    expanded: [],
    leftPct: source?.leftPct ?? 26,
  };
}

export function normalizeWorkspaceForAccess(
    ws: WorkspaceStateV2,
    access: IdeWorkspaceAccess,
): WorkspaceStateV2 {
  if (ws.language === "web") return ws;
  if (access.canUseMultiFile) return ws;

  const fileCount = ws.nodes.filter((n): n is FileNode => n.kind === "file").length;
  if (fileCount <= 1) return ws;

  return buildSingleFileWorkspace(ws.language, ws);
}

export function fileIdsOf(nodes: FSNode[]) {
  return new Set(
      nodes.filter((n): n is FileNode => n.kind === "file").map((n) => n.id),
  );
}

export function pickFirstRemainingFileId(nodes: FSNode[]) {
  return nodes.find((n): n is FileNode => n.kind === "file")?.id ?? "";
}