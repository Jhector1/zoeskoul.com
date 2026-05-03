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

type NormalizedStarterFile = {
  path: string;
  content: string;
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
): NormalizedStarterFile[] {
  const files: NormalizedStarterFile[] = [];

  if (Array.isArray(raw)) {
    raw.forEach((file, index) => {
      const fallback =
          index === 0 ? fallbackEntryFile : `file-${String(index + 1)}.txt`;

      files.push({
        path: starterFilePath(file, fallback),
        content: starterFileContent(file),
      });
    });

    return dedupeStarterFiles(files, fallbackEntryFile);
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

  return dedupeStarterFiles(files, fallbackEntryFile);
}

function dedupeStarterFiles(
    files: NormalizedStarterFile[],
    fallbackEntryFile: string,
) {
  const seen = new Set<string>();
  const result: NormalizedStarterFile[] = [];

  for (const file of files) {
    const path = normalizePath(file.path, fallbackEntryFile);
    if (seen.has(path)) continue;

    seen.add(path);
    result.push({
      path,
      content: file.content ?? "",
    });
  }

  return result;
}

function getWorkspaceSeed(manifest: AnyRecord) {
  if (isRecord(manifest.workspace) && !isWorkspace(manifest.workspace)) {
    return manifest.workspace;
  }

  if (isRecord(manifest.workspaceSeed)) return manifest.workspaceSeed;
  if (isRecord(manifest.initialWorkspaceSeed)) return manifest.initialWorkspaceSeed;

  return {};
}

function getEntryFile(args: {
  manifest: AnyRecord;
  language: WorkspaceLanguage;
}) {
  const { manifest, language } = args;
  const workspace = getWorkspaceSeed(manifest);

  return normalizePath(
      workspace.entryFile ??
      workspace.entryFilePath ??
      workspace.mainFile ??
      workspace.mainFilePath ??
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
  const workspace = getWorkspaceSeed(manifest);

  return (
      workspace.initialStdin ??
      workspace.stdin ??
      manifest.initialStdin ??
      manifest.stdin ??
      manifest.starterStdin ??
      manifest.recipe?.initialStdin ??
      manifest.recipe?.stdin ??
      ""
  );
}

function getStarterFilesSource(manifest: AnyRecord) {
  const workspace = getWorkspaceSeed(manifest);

  return (
      workspace.starterFiles ??
      workspace.files ??
      workspace.initialFiles ??
      workspace.workspaceFiles ??
      manifest.starterFiles ??
      manifest.files ??
      manifest.initialFiles ??
      manifest.workspaceFiles ??
      manifest.recipe?.starterFiles ??
      null
  );
}

function getStarterCode(manifest: AnyRecord) {
  const workspace = getWorkspaceSeed(manifest);

  return (
      workspace.starterCode ??
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
  starterFiles: NormalizedStarterFile[];
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

  for (const file of args.starterFiles) {
    const path = normalizePath(file.path, args.entryFile);
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

  const normalizedEntry = normalizePath(
      args.entryFile,
      defaultMainFile(args.language),
  );

  const entryFileId =
      fileByPath.get(normalizedEntry) ??
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
  const normalizedEntry = normalizePath(
      args.entryFile,
      defaultMainFile(args.language),
  );
  const parts = normalizedEntry.split("/");
  const fileName = parts.pop() || defaultMainFile(args.language);

  const nodes: FSNode[] = [];
  let parentId: NodeId | null = null;
  const expanded: NodeId[] = [];

  for (const part of parts) {
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

function nodePathById(workspace: WorkspaceStateV2) {
  const byId = new Map<NodeId, FSNode>();

  for (const node of workspace.nodes) {
    byId.set(node.id, node);
  }

  const cache = new Map<NodeId, string>();

  function getPath(node: FSNode): string {
    const cached = cache.get(node.id);
    if (cached) return cached;

    const parent =
        node.parentId && byId.has(node.parentId) ? byId.get(node.parentId) : null;

    const path = parent ? `${getPath(parent)}/${node.name}` : node.name;
    const normalized = normalizePath(path, node.name);

    cache.set(node.id, normalized);
    return normalized;
  }

  const result = new Map<NodeId, string>();

  for (const node of workspace.nodes) {
    result.set(node.id, getPath(node));
  }

  return result;
}

function getFilePathMap(workspace: WorkspaceStateV2) {
  const pathById = nodePathById(workspace);
  const files = new Map<string, FileNode>();

  for (const node of workspace.nodes) {
    if (node.kind !== "file") continue;

    const path = pathById.get(node.id);
    if (!path) continue;

    files.set(normalizePath(path, node.name), node as FileNode);
  }

  return files;
}

function getFolderPathMap(workspace: WorkspaceStateV2) {
  const pathById = nodePathById(workspace);
  const folders = new Map<string, FolderNode>();

  for (const node of workspace.nodes) {
    if (node.kind !== "folder") continue;

    const path = pathById.get(node.id);
    if (!path) continue;

    folders.set(normalizePath(path, node.name), node as FolderNode);
  }

  return folders;
}

function ensureFolderInNodes(args: {
  nodes: FSNode[];
  foldersByPath: Map<string, FolderNode>;
  expanded: NodeId[];
  folderParts: string[];
  now: number;
}) {
  const { nodes, foldersByPath, expanded, folderParts, now } = args;

  let parentId: NodeId | null = null;
  let currentPath = "";

  for (const part of folderParts) {
    currentPath = currentPath ? `${currentPath}/${part}` : part;

    const existing = foldersByPath.get(currentPath);
    if (existing) {
      parentId = existing.id;
      continue;
    }

    const id = uid();

    const folder: FolderNode = {
      id,
      kind: "folder",
      name: part,
      parentId,
      createdAt: now,
      updatedAt: now,
    };

    nodes.push(folder);
    foldersByPath.set(currentPath, folder);

    if (!expanded.includes(id)) {
      expanded.push(id);
    }

    parentId = id;
  }

  return parentId;
}

function shouldReplaceExistingFileWithStarter(args: {
  existingFile: FileNode;
  starterContent: string;
}) {
  const existingContent = String(args.existingFile.content ?? "");
  const starterContent = String(args.starterContent ?? "");

  if (!starterContent) return false;

  /**
   * Safe migration:
   * If the existing file is blank, it is usually an old auto-created main.py.
   * Fill it with the starter file content.
   */
  if (existingContent.trim() === "") return true;

  return false;
}

function starterSignature(args: {
  language: WorkspaceLanguage;
  entryFile: string;
  stdin: string;
  starterFiles: NormalizedStarterFile[];
  starterCode: string;
}) {
  return JSON.stringify({
    language: args.language,
    entryFile: args.entryFile,
    stdin: args.stdin,
    starterFiles: args.starterFiles.map((file) => ({
      path: normalizePath(file.path, args.entryFile),
      content: file.content ?? "",
    })),
    starterCode: args.starterCode ?? "",
  });
}

function attachStarterSignature(
    workspace: WorkspaceStateV2,
    signature: string,
): WorkspaceStateV2 {
  return {
    ...workspace,
    starterSignature: signature,
  } as WorkspaceStateV2;
}

function mergeStarterFilesIntoSavedWorkspace(args: {
  saved: WorkspaceStateV2;
  language: WorkspaceLanguage;
  entryFile: string;
  stdin: string;
  starterFiles: NormalizedStarterFile[];
  signature: string;
}): WorkspaceStateV2 {
  const now = Date.now();
  const workspace = cloneWorkspace(args.saved);

  const nodes = Array.isArray(workspace.nodes)
      ? workspace.nodes.map((node) => ({ ...node }))
      : [];

  const expanded = Array.isArray(workspace.expanded)
      ? [...workspace.expanded]
      : [];

  const filesByPath = getFilePathMap({
    ...workspace,
    nodes,
  });

  const foldersByPath = getFolderPathMap({
    ...workspace,
    nodes,
  });

  let entryFileId = workspace.entryFileId || workspace.activeFileId || "";
  let changed = false;

  for (const starter of args.starterFiles) {
    const path = normalizePath(starter.path, args.entryFile);
    const existingFile = filesByPath.get(path);

    if (existingFile) {
      if (
          shouldReplaceExistingFileWithStarter({
            existingFile,
            starterContent: starter.content,
          })
      ) {
        const index = nodes.findIndex((node) => node.id === existingFile.id);

        if (index >= 0 && nodes[index]?.kind === "file") {
          nodes[index] = {
            ...nodes[index],
            content: starter.content,
            updatedAt: now,
          } as FileNode;

          changed = true;
        }
      }

      if (path === normalizePath(args.entryFile, defaultMainFile(args.language))) {
        entryFileId = existingFile.id;
      }

      continue;
    }

    const parts = path.split("/");
    const name = parts.pop() || defaultMainFile(args.language);

    const parentId = ensureFolderInNodes({
      nodes,
      foldersByPath,
      expanded,
      folderParts: parts,
      now,
    });

    const id = uid();

    const file: FileNode = {
      id,
      kind: "file",
      name,
      parentId,
      content: starter.content ?? "",
      createdAt: now,
      updatedAt: now,
    };

    nodes.push(file);
    filesByPath.set(path, file);
    changed = true;

    if (path === normalizePath(args.entryFile, defaultMainFile(args.language))) {
      entryFileId = id;
    }
  }

  if (!entryFileId) {
    const entryPath = normalizePath(args.entryFile, defaultMainFile(args.language));
    entryFileId =
        filesByPath.get(entryPath)?.id ??
        nodes.find((node) => node.kind === "file")?.id ??
        "";
  }

  const openTabs = Array.isArray(workspace.openTabs)
      ? [...workspace.openTabs]
      : [];

  if (entryFileId && !openTabs.includes(entryFileId)) {
    openTabs.unshift(entryFileId);
    changed = true;
  }

  const nextWorkspace: WorkspaceStateV2 = {
    ...workspace,
    language: args.language,
    nodes,
    expanded,
    openTabs,
    activeFileId: workspace.activeFileId || entryFileId,
    entryFileId,
    stdin:
        typeof workspace.stdin === "string" && workspace.stdin !== ""
            ? workspace.stdin
            : args.stdin,
  };

  /**
   * Always attach the signature once we have considered starter files.
   * This prevents constantly re-running migration logic for the same manifest.
   */
  return attachStarterSignature(nextWorkspace, args.signature);
}

export function resolveExerciseWorkspace(args: {
  language: WorkspaceLanguage | string;
  manifest: any;
  saved?: WorkspaceStateV2 | null;
}): WorkspaceStateV2 {
  const language = (args.language || "python") as WorkspaceLanguage;
  const manifest = (args.manifest ?? {}) as AnyRecord;

  const entryFile = getEntryFile({ manifest, language });
  const stdin = String(getInitialStdin(manifest) ?? "");
  const starterFiles = normalizeStarterFiles(
      getStarterFilesSource(manifest),
      entryFile,
  );
  const starterCode = String(getStarterCode(manifest) ?? "");

  const signature = starterSignature({
    language,
    entryFile,
    stdin,
    starterFiles,
    starterCode,
  });

  /**
   * Important:
   * Saved workspace should NOT block starter files.
   *
   * Old behavior:
   *   saved workspace exists -> return saved workspace
   *
   * New behavior:
   *   saved workspace exists + starterFiles exist -> merge missing starter files
   *   saved learner-edited files still win
   */
  if (isWorkspace(args.saved)) {
    if (starterFiles.length > 0) {
      return mergeStarterFilesIntoSavedWorkspace({
        saved: args.saved,
        language,
        entryFile,
        stdin,
        starterFiles,
        signature,
      });
    }

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
    if (starterFiles.length > 0) {
      return mergeStarterFilesIntoSavedWorkspace({
        saved: savedFromManifest,
        language,
        entryFile,
        stdin,
        starterFiles,
        signature,
      });
    }

    return cloneWorkspace(savedFromManifest);
  }

  if (starterFiles.length > 0) {
    const starterWorkspace = buildWorkspaceFromStarterFiles({
      language,
      entryFile,
      starterFiles,
      stdin,
    });

    const fileCount = starterWorkspace.nodes.filter(
        (node) => node.kind === "file",
    ).length;

    if (starterCode && fileCount <= 1) {
      return attachStarterSignature(
          patchEntryFileContent({
            workspace: starterWorkspace,
            content: starterCode,
          }),
          signature,
      );
    }

    return attachStarterSignature(starterWorkspace, signature);
  }

  return attachStarterSignature(
      buildDefaultWorkspace({
        language,
        entryFile,
        code: starterCode,
        stdin,
      }),
      signature,
  );
}