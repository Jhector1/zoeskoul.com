import type {
  FileNode,
  FolderNode,
  FSNode,
  NodeId,
  WorkspaceStateV2,
} from "@/components/ide/types";
import type { WorkspaceLanguage } from "@/lib/practice/types";
import { defaultMainFile } from "@/components/ide/languageDefaults";
import { uid } from "@/components/ide/utils";

type AnyRecord = Record<string, any>;

type StarterFile =
  | string
  | {
      path?: string;
      filePath?: string;
      filename?: string;
      name?: string;
      content?: string;
      text?: string;
      code?: string;
      source?: string;
    };

function isRecord(value: unknown): value is AnyRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function isWorkspace(value: unknown): value is WorkspaceStateV2 {
  return (
    !!value &&
    typeof value === "object" &&
    (value as any).version === 2 &&
    Array.isArray((value as any).nodes)
  );
}

function cloneWorkspace(workspace: WorkspaceStateV2): WorkspaceStateV2 {
  return {
    ...workspace,
    nodes: Array.isArray(workspace.nodes)
      ? workspace.nodes.map((node) => ({ ...node }))
      : [],
    openTabs: Array.isArray(workspace.openTabs) ? [...workspace.openTabs] : [],
    expanded: Array.isArray(workspace.expanded) ? [...workspace.expanded] : [],
  };
}

function normalizePath(input: unknown, fallback: string) {
  const raw = typeof input === "string" && input.trim() ? input : fallback;

  const parts = raw
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .split("/")
    .map((part) => part.trim())
    .filter((part) => part && part !== "." && part !== "..");

  return parts.join("/") || fallback;
}

function starterFilePath(file: StarterFile, fallback: string) {
  if (typeof file === "string") return normalizePath(file, fallback);
  if (!isRecord(file)) return fallback;

  return normalizePath(
    file.path ?? file.filePath ?? file.filename ?? file.name,
    fallback,
  );
}

function starterFileContent(file: StarterFile) {
  if (typeof file === "string") return "";
  if (!isRecord(file)) return "";

  for (const key of ["content", "text", "code", "source"] as const) {
    if (typeof file[key] === "string") return file[key];
  }

  return "";
}

function normalizeStarterFiles(
  raw: unknown,
  fallbackEntryFile: string,
): Array<{ path: string; content: string }> {
  const files: Array<{ path: string; content: string }> = [];

  if (Array.isArray(raw)) {
    raw.forEach((file, index) => {
      const fallback =
        index === 0 ? fallbackEntryFile : `file-${String(index + 1)}.txt`;

      files.push({
        path: starterFilePath(file, fallback),
        content: starterFileContent(file),
      });
    });

    return files;
  }

  if (isRecord(raw)) {
    for (const [path, value] of Object.entries(raw)) {
      files.push({
        path: normalizePath(path, fallbackEntryFile),
        content:
          typeof value === "string"
            ? value
            : isRecord(value)
              ? starterFileContent(value)
              : "",
      });
    }
  }

  return files;
}

function getEntryFile(args: {
  manifest: AnyRecord;
  language: WorkspaceLanguage;
}) {
  const { manifest, language } = args;

  return normalizePath(
    manifest.workspace?.entryFile ??
      manifest.entryFile ??
      manifest.entryFilePath ??
      manifest.mainFile ??
      manifest.mainFilePath ??
      manifest.recipe?.entryFile ??
      manifest.recipe?.entryFilePath,
    defaultMainFile(language),
  );
}

function getInitialStdin(manifest: AnyRecord) {
  return (
    manifest.workspace?.initialStdin ??
    manifest.initialStdin ??
    manifest.stdin ??
    manifest.recipe?.initialStdin ??
    manifest.recipe?.stdin ??
    ""
  );
}

function getStarterFilesSource(manifest: AnyRecord) {
  return (
    manifest.workspace?.starterFiles ??
    manifest.starterFiles ??
    manifest.files ??
    manifest.initialFiles ??
    manifest.workspaceFiles ??
    manifest.recipe?.starterFiles ??
    null
  );
}

function getStarterCode(manifest: AnyRecord) {
  return (
    manifest.workspace?.starterCode ??
    manifest.starterCode ??
    manifest.recipe?.starterCode ??
    ""
  );
}

function patchEntryFileContent(args: {
  workspace: WorkspaceStateV2;
  content: string;
}) {
  const { workspace, content } = args;
  const entryFileId = workspace.entryFileId || workspace.activeFileId;

  return {
    ...workspace,
    nodes: workspace.nodes.map((node) =>
      node.kind === "file" && node.id === entryFileId
        ? { ...node, content, updatedAt: Date.now() }
        : node,
    ),
  };
}

function buildWorkspaceFromStarterFiles(args: {
  language: WorkspaceLanguage;
  entryFile: string;
  starterFiles: Array<{ path: string; content: string }>;
  stdin: string;
}): WorkspaceStateV2 {
  const now = Date.now();
  const nodes: FSNode[] = [];
  const folderByPath = new Map<string, NodeId>();
  const fileByPath = new Map<string, NodeId>();
  const expanded: NodeId[] = [];

  function ensureFolder(parts: string[]) {
    let parentId: NodeId | null = null;
    let currentPath = "";

    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;

      const existing = folderByPath.get(currentPath);
      if (existing) {
        parentId = existing;
        continue;
      }

      const id = uid();
      const node: FolderNode = {
        id,
        kind: "folder",
        name: part,
        parentId,
        createdAt: now,
        updatedAt: now,
      };

      nodes.push(node);
      folderByPath.set(currentPath, id);
      expanded.push(id);
      parentId = id;
    }

    return parentId;
  }

  const seenPaths = new Set<string>();

  for (const file of args.starterFiles) {
    const path = normalizePath(file.path, args.entryFile);
    if (seenPaths.has(path)) continue;
    seenPaths.add(path);

    const parts = path.split("/");
    const name = parts.pop() || defaultMainFile(args.language);
    const parentId = ensureFolder(parts);
    const id = uid();

    const node: FileNode = {
      id,
      kind: "file",
      name,
      parentId,
      content: file.content ?? "",
      createdAt: now,
      updatedAt: now,
    };

    nodes.push(node);
    fileByPath.set(path, id);
  }

  const entryFileId =
    fileByPath.get(args.entryFile) ??
    fileByPath.get(defaultMainFile(args.language)) ??
    [...fileByPath.values()][0] ??
    "";

  return {
    version: 2,
    language: args.language,
    nodes,
    openTabs: entryFileId ? [entryFileId] : [],
    activeFileId: entryFileId,
    entryFileId,
    stdin: args.stdin,
    expanded,
    leftPct: 26,
  };
}

function buildDefaultWorkspace(args: {
  language: WorkspaceLanguage;
  entryFile: string;
  code: string;
  stdin: string;
}): WorkspaceStateV2 {
  const now = Date.now();
  const id = uid();
  const normalizedEntry = normalizePath(args.entryFile, defaultMainFile(args.language));
  const parts = normalizedEntry.split("/");
  const fileName = parts.pop() || defaultMainFile(args.language);

  const nodes: FSNode[] = [];
  let parentId: NodeId | null = null;
  let currentPath = "";
  const expanded: NodeId[] = [];

  for (const part of parts) {
    currentPath = currentPath ? `${currentPath}/${part}` : part;
    const folderId = uid();

    nodes.push({
      id: folderId,
      kind: "folder",
      name: part,
      parentId,
      createdAt: now,
      updatedAt: now,
    });

    expanded.push(folderId);
    parentId = folderId;
  }

  nodes.push({
    id,
    kind: "file",
    name: fileName,
    parentId,
    content: args.code,
    createdAt: now,
    updatedAt: now,
  });

  return {
    version: 2,
    language: args.language,
    nodes,
    openTabs: [id],
    activeFileId: id,
    entryFileId: id,
    stdin: args.stdin,
    expanded,
    leftPct: 26,
  };
}

function isWorkspaceStateV2(value: unknown): value is WorkspaceStateV2 {
  return (
    !!value &&
    typeof value === "object" &&
    (value as any).version === 2 &&
    Array.isArray((value as any).nodes)
  );
}

export function deriveEntryCode(
  workspace: WorkspaceStateV2 | null | undefined,
): string | null {
  if (!isWorkspaceStateV2(workspace)) return null;

  const entryId = workspace.entryFileId || workspace.activeFileId;
  const entryNode = workspace.nodes.find(
    (node) => node.kind === "file" && node.id === entryId,
  );

  return entryNode && entryNode.kind === "file"
    ? String(entryNode.content ?? "")
    : null;
}

export function resolveExerciseWorkspace(args: {
  language: WorkspaceLanguage | string;
  manifest: any;
  saved?: WorkspaceStateV2 | null;
}): WorkspaceStateV2 {
  const language = (args.language || "python") as WorkspaceLanguage;
  const manifest = (args.manifest ?? {}) as AnyRecord;

  if (isWorkspace(args.saved)) {
    return cloneWorkspace(args.saved);
  }

  const savedFromManifest =
    manifest.workspace && isWorkspace(manifest.workspace)
      ? manifest.workspace
      : manifest.initialWorkspace && isWorkspace(manifest.initialWorkspace)
        ? manifest.initialWorkspace
        : manifest.starterWorkspace && isWorkspace(manifest.starterWorkspace)
          ? manifest.starterWorkspace
          : null;

  if (savedFromManifest) {
    return cloneWorkspace(savedFromManifest);
  }

  const entryFile = getEntryFile({ manifest, language });
  const stdin = String(getInitialStdin(manifest) ?? "");
  const starterFiles = normalizeStarterFiles(
    getStarterFilesSource(manifest),
    entryFile,
  );

  if (starterFiles.length > 0) {
    const starterWorkspace = buildWorkspaceFromStarterFiles({
      language,
      entryFile,
      starterFiles,
      stdin,
    });

    const starterCode = getStarterCode(manifest);
    const fileCount = starterWorkspace.nodes.filter(
      (node) => node.kind === "file",
    ).length;

    if (typeof starterCode === "string" && starterCode && fileCount <= 1) {
      return patchEntryFileContent({
        workspace: starterWorkspace,
        content: starterCode,
      });
    }

    return starterWorkspace;
  }

  return buildDefaultWorkspace({
    language,
    entryFile,
    code: String(getStarterCode(manifest) ?? ""),
    stdin,
  });
}
