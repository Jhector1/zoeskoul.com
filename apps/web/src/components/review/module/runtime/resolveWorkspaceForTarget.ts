import type {
  FileNode,
  FolderNode,
  FSNode,
  NodeId,
  WorkspaceStateV2,
} from "@/components/ide/types";
import { defaultMainFile } from "@/components/ide/languageDefaults";
import type { WorkspaceLanguage } from "@/lib/practice/types";
import {
  cleanStarterCode,
  hasUsableStarterFilesValue,
  isUsableStarterCode,
  mergeStarterFileSources,
  pickEntryFileFromStarterFilesValue,
} from "@/components/review/module/runtime/starterContent";
import { languagesCompatible } from "@/components/review/module/utils";

type UnknownRecord = Record<string, unknown>;

export type WorkspaceTargetKind = "exercise" | "card";

export type ManifestWorkspaceDefinition = {
  requested: boolean;
  language: WorkspaceLanguage;
  entryFile: string;
  seedSource: "starter" | "default" | "none";
  stdin: string;
  starterCode: string;
  starterFiles: Array<{ path: string; content: string }>;
  fixtureFiles: Array<{ path: string; content: string }>;
  manifestWorkspace: WorkspaceStateV2 | null;
  starterHash: string;
};

export type SavedWorkspaceState = {
  targetKey?: string | null;
  workspace?: WorkspaceStateV2 | null;
  code?: string | null;
  source?: string | null;
  stdin?: string | null;
  language?: string | null;
  lang?: string | null;
  userEdited?: boolean;
  workspaceOrigin?: string | null;
  starterHash?: string | null;
  updatedAt?: number | null;
};
export type EntryWorkspaceFallback = {
  targetKey?: string | null;
  language?: string | null;
  lang?: string | null;
  item?: unknown;
  starterCode?: unknown;
  starterFiles?: unknown;

  /**
   * Keep these unknown because ReviewTargetEntry stores manifest-derived
   * workspace fields as unknown. The resolver already narrows them with
   * isWorkspace(...) before use.
   */
  starterWorkspace?: unknown;
  workspace?: unknown;
};
export type LocalDraftWorkspaceState = {
  targetKey: string;
  workspace: WorkspaceStateV2;
  savedAt: number;
};

export type ResolvedWorkspaceForTarget = {
  workspace: WorkspaceStateV2 | null;
  code: string;
  stdin: string;
  language: WorkspaceLanguage;
  source: "manifest" | "saved" | "draft" | "empty" | "none";
  starterHash: string;
  manifest: ManifestWorkspaceDefinition;
};

export type ResolvedWorkspaceForExerciseTarget = {
  workspace: WorkspaceStateV2;
  source: "saved" | "starter";
  entryFilePath: string;
};


function isRecord(value: unknown): value is UnknownRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isWorkspace(value: unknown): value is WorkspaceStateV2 {
  return (
    !!value &&
    typeof value === "object" &&
    (value as WorkspaceStateV2).version === 2 &&
    Array.isArray((value as WorkspaceStateV2).nodes)
  );
}

function firstWorkspace(...values: unknown[]): WorkspaceStateV2 | null {
  for (const value of values) {
    if (isWorkspace(value)) {
      return value;
    }
  }

  return null;
}

function normalizeManifestShape(input: unknown): UnknownRecord {
  const manifest = isRecord(input) ? input : {};
  const spec = isRecord(manifest.spec) ? manifest.spec : {};
  const workspace = isRecord(manifest.workspace)
    ? manifest.workspace
    : isRecord(spec.workspace)
      ? spec.workspace
      : {};
  const recipe = isRecord(manifest.recipe)
    ? manifest.recipe
    : isRecord(spec.recipe)
      ? spec.recipe
      : {};

  return {
    ...spec,
    ...manifest,
    workspace,
    recipe,
  };
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

function mergeNormalizedStarterFiles(
  sources: Array<unknown>,
  fallbackEntryFile: string,
): Array<{ path: string; content: string }> {
  return mergeStarterFileSources(sources, fallbackEntryFile);
}

function explicitStarterCodeFromManifest(manifest: UnknownRecord) {
  const workspace = isRecord(manifest.workspace) ? manifest.workspace : {};
  const recipe = isRecord(manifest.recipe) ? manifest.recipe : {};

  return (
    cleanStarterCode(workspace.starterCode) ??
    cleanStarterCode(manifest?.starterCode) ??
    cleanStarterCode(recipe.starterCode) ??
    ""
  );
}

function getStarterCode(manifest: UnknownRecord) {
  return explicitStarterCodeFromManifest(manifest);
}

function pickNonBlankString(...values: Array<unknown>) {
  for (const value of values) {
    if (isUsableStarterCode(value)) return value;
  }
  return "";
}

function collectManifestStarterFileSources(manifest: UnknownRecord) {
  const normalized = normalizeManifestShape(manifest);
  const workspace = isRecord(normalized.workspace) ? normalized.workspace : {};
  const recipe = isRecord(normalized.recipe) ? normalized.recipe : {};

  return [
    workspace.starterFiles,
    normalized.starterFiles,
    recipe.starterFiles,
  ];
}

function collectManifestFixtureFileSources(manifest: UnknownRecord) {
  const normalized = normalizeManifestShape(manifest);
  const workspace = isRecord(normalized.workspace) ? normalized.workspace : {};
  const recipe = isRecord(normalized.recipe) ? normalized.recipe : {};

  const tests = Array.isArray(normalized.tests) ? normalized.tests : [];
  const testFiles = tests.flatMap((test) => {
    if (!isRecord(test)) return [];
    return [test.files, test.fixtures, test.fixtureFiles, test.fileFixtures];
  });

  return [
    workspace.files,
    workspace.initialFiles,
    workspace.workspaceFiles,
    workspace.fixtureFiles,
    workspace.fixtures,
    workspace.fileFixtures,
    normalized.files,
    normalized.initialFiles,
    normalized.workspaceFiles,
    normalized.fixtureFiles,
    normalized.fixtures,
    normalized.fileFixtures,
    recipe.files,
    recipe.initialFiles,
    recipe.fixtureFiles,
    recipe.fixtures,
    recipe.fileFixtures,
    ...testFiles,
  ];
}

function collectEntryFileSources(manifest: UnknownRecord) {
  const manifestWorkspace = isRecord(manifest.workspace) ? manifest.workspace : {};
  const manifestRecipe = isRecord(manifest.recipe) ? manifest.recipe : {};

  return [
    manifestWorkspace.starterFiles,
    manifest.starterFiles,
    manifestRecipe.starterFiles,
  ];
}

function getEntryFileFromStarterFiles(raw: unknown): string {
  const entry = pickEntryFileFromStarterFilesValue(raw, "");
  return entry.trim() ? entry : "";
}

function getEntryFile(args: {
  manifest: UnknownRecord;
  language: WorkspaceLanguage;
}) {
  const { manifest, language } = args;
  const workspace = isRecord(manifest.workspace) ? manifest.workspace : {};
  const recipe = isRecord(manifest.recipe) ? manifest.recipe : {};

  return normalizePath(
    workspace.entryFile ??
      manifest.entryFile ??
      manifest.entryFilePath ??
      manifest.mainFile ??
      manifest.mainFilePath ??
      recipe.entryFile ??
      recipe.entryFilePath,
    defaultMainFile(language),
  );
}

function getInitialStdin(manifest: UnknownRecord) {
  const workspace = isRecord(manifest.workspace) ? manifest.workspace : {};
  const recipe = isRecord(manifest.recipe) ? manifest.recipe : {};
  return (
    workspace.initialStdin ??
    manifest.initialStdin ??
    manifest.stdin ??
    recipe.initialStdin ??
    recipe.stdin ??
    ""
  );
}

function stableStarterNodeId(kind: "file" | "folder", path: string): NodeId {
  const safe = String(path || "root")
    .replace(/\\/g, "/")
    .replace(/[^a-zA-Z0-9._/-]+/g, "-")
    .replace(/^\/+/, "")
    .replace(/\/+$/g, "")
    .replace(/\//g, "__");

  return `${kind}:${safe || "root"}` as NodeId;
}

function buildWorkspaceFromFiles(args: {
  language: WorkspaceLanguage;
  entryFile: string;
  files: Array<{ path: string; content: string }>;
  stdin: string;
}): WorkspaceStateV2 {
  const now = 0;
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

      const id = stableStarterNodeId("folder", currentPath);
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

  for (const file of args.files) {
    const path = normalizePath(file.path, args.entryFile);
    if (seenPaths.has(path)) continue;
    seenPaths.add(path);

    const parts = path.split("/");
    const name = parts.pop() || defaultMainFile(args.language);
    const parentId = ensureFolder(parts);
    const id = stableStarterNodeId("file", path);

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
  const now = 0;
  const normalizedEntry = normalizePath(args.entryFile, defaultMainFile(args.language));
  const id = stableStarterNodeId("file", normalizedEntry);
  const parts = normalizedEntry.split("/");
  const fileName = parts.pop() || defaultMainFile(args.language);

  const nodes: FSNode[] = [];
  let parentId: NodeId | null = null;
  let currentPath = "";
  const expanded: NodeId[] = [];

  for (const part of parts) {
    currentPath = currentPath ? `${currentPath}/${part}` : part;
    const folderId = stableStarterNodeId("folder", currentPath);

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

function workspacePathForNode(nodes: FSNode[], nodeId: NodeId): string {
  const node = nodes.find((candidate) => candidate.id === nodeId);
  if (!node) return "";

  const names: string[] = [node.name];
  let parentId = node.parentId ?? null;

  while (parentId) {
    const parent = nodes.find((candidate) => candidate.id === parentId);
    if (!parent) break;

    names.unshift(parent.name);
    parentId = parent.parentId ?? null;
  }

  return names.join("/");
}

function workspaceFilePaths(workspace: WorkspaceStateV2): Set<string> {
  const paths = new Set<string>();

  for (const node of workspace.nodes) {
    if (node.kind !== "file") continue;
    const path = workspacePathForNode(workspace.nodes, node.id);
    if (path) paths.add(normalizePath(path, node.name));
  }

  return paths;
}

function ensureWorkspaceFolder(args: {
  workspace: WorkspaceStateV2;
  folderPath: string;
}): NodeId | null {
  const folderPath = normalizePath(args.folderPath, "");
  if (!folderPath) return null;

  const parts = folderPath.split("/").filter(Boolean);
  let parentId: NodeId | null = null;
  let currentPath = "";

  for (const part of parts) {
    currentPath = currentPath ? `${currentPath}/${part}` : part;

    const existing = args.workspace.nodes.find((node) => {
      return node.kind === "folder" && node.name === part && node.parentId === parentId;
    });

    if (existing) {
      parentId = existing.id;
      continue;
    }

    const folderId = stableStarterNodeId("folder", currentPath);

    args.workspace.nodes.push({
      id: folderId,
      kind: "folder",
      name: part,
      parentId,
      createdAt: 0,
      updatedAt: 0,
    });

    if (!args.workspace.expanded.includes(folderId)) {
      args.workspace.expanded.push(folderId);
    }

    parentId = folderId;
  }

  return parentId;
}

function mergeMissingFilesIntoWorkspace(args: {
  base: WorkspaceStateV2;
  fixtureFiles: Array<{ path: string; content: string }>;
}): WorkspaceStateV2 {
  if (args.fixtureFiles.length === 0) {
    return cloneWorkspace(args.base);
  }

  const workspace = cloneWorkspace(args.base);
  const existingPaths = workspaceFilePaths(workspace);

  for (const file of args.fixtureFiles) {
    const path = normalizePath(file.path, defaultMainFile(workspace.language));
    if (!path || existingPaths.has(path)) continue;

    const parts = path.split("/");
    const name = parts.pop() || defaultMainFile(workspace.language);
    const folderPath = parts.join("/");
    const parentId = ensureWorkspaceFolder({ workspace, folderPath });

    const fileId = stableStarterNodeId("file", path);

    workspace.nodes.push({
      id: fileId,
      kind: "file",
      name,
      parentId,
      content: file.content ?? "",
      createdAt: 0,
      updatedAt: 0,
    });

    existingPaths.add(path);
  }

  return workspace;
}


function workspaceFileEntries(
  workspace: WorkspaceStateV2 | null | undefined,
): Array<{ path: string; content: string }> {
  if (!isWorkspace(workspace)) return [];

  return workspace.nodes
    .filter((node) => node.kind === "file")
    .map((node) => {
      const path = normalizePath(
        workspacePathForNode(workspace.nodes, String(node.id ?? "")),
        defaultMainFile(workspace.language),
      );

      return {
        path,
        content: String(node.content ?? ""),
      };
    })
    .filter((file) => file.path.trim().length > 0);
}

function isLegacyGeneratedSafeDirectoryConfig(content: string): boolean {
  const lines = String(content ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && !line.startsWith(";"));

  if (lines.length < 2) return false;

  let sawSafeSection = false;
  let sawDirectory = false;

  for (const line of lines) {
    if (/^\[safe\]$/i.test(line)) {
      sawSafeSection = true;
      continue;
    }

    const match = /^directory\s*=\s*(.+)$/i.exec(line);
    if (!match || !sawSafeSection) return false;

    const directory = match[1].trim().replace(/^['"]|['"]$/g, "");
    if (directory !== "/workspace" && !directory.startsWith("/workspace/")) {
      return false;
    }

    sawDirectory = true;
  }

  return sawSafeSection && sawDirectory;
}

function sanitizeLegacyWorkspaceArtifacts(args: {
  workspace: WorkspaceStateV2;
  manifest: ManifestWorkspaceDefinition;
  userOwned: boolean;
}): WorkspaceStateV2 {
  const workspace = cloneWorkspace(args.workspace);
  const authoredPaths = new Set(
    [...args.manifest.starterFiles, ...args.manifest.fixtureFiles].map((file) =>
      normalizePath(file.path, args.manifest.entryFile),
    ),
  );
  const authoredEntry = normalizePath(
    args.manifest.entryFile,
    defaultMainFile(args.manifest.language),
  );
  const defaultEntry = normalizePath(
    defaultMainFile(args.manifest.language),
    defaultMainFile(args.manifest.language),
  );
  const removeIds = new Set<NodeId>();

  for (const node of workspace.nodes) {
    if (node.kind !== "file") continue;

    const path = normalizePath(
      workspacePathForNode(workspace.nodes, node.id),
      node.name,
    );
    const content = String(node.content ?? "");
    const isUnlistedDefaultEntry =
      path === defaultEntry &&
      authoredEntry !== defaultEntry &&
      !authoredPaths.has(path);
    const isDisposableDefaultEntry =
      isUnlistedDefaultEntry && (!args.userOwned || !content.trim());
    const isGeneratedGitConfig =
      (path === ".gitconfig" || path.endsWith("/.gitconfig")) &&
      !authoredPaths.has(path) &&
      isLegacyGeneratedSafeDirectoryConfig(content);

    if (isDisposableDefaultEntry || isGeneratedGitConfig) {
      removeIds.add(node.id);
    }
  }

  if (removeIds.size === 0) return workspace;

  const nodeById = new Map(workspace.nodes.map((node) => [node.id, node]));
  const possibleEmptyFolderIds = new Set<NodeId>();

  for (const id of removeIds) {
    let parentId = nodeById.get(id)?.parentId ?? null;

    while (parentId) {
      if (possibleEmptyFolderIds.has(parentId)) break;
      possibleEmptyFolderIds.add(parentId);
      parentId = nodeById.get(parentId)?.parentId ?? null;
    }
  }

  let nextNodes = workspace.nodes.filter((node) => !removeIds.has(node.id));
  let removedFolder = true;

  while (removedFolder) {
    removedFolder = false;
    const parentIds = new Set(
      nextNodes
        .map((node) => node.parentId)
        .filter((id): id is NodeId => Boolean(id)),
    );
    const emptyFolderIds = new Set(
      nextNodes
        .filter(
          (node) =>
            node.kind === "folder" &&
            possibleEmptyFolderIds.has(node.id) &&
            !parentIds.has(node.id),
        )
        .map((node) => node.id),
    );

    if (emptyFolderIds.size > 0) {
      nextNodes = nextNodes.filter((node) => !emptyFolderIds.has(node.id));
      emptyFolderIds.forEach((id) => removeIds.add(id));
      removedFolder = true;
    }
  }

  const fileByPath = new Map<string, FileNode>();
  for (const node of nextNodes) {
    if (node.kind !== "file") continue;
    const path = normalizePath(
      workspacePathForNode(nextNodes, node.id),
      node.name,
    );
    fileByPath.set(path, node);
  }

  const fallbackFile =
    fileByPath.get(authoredEntry) ??
    nextNodes.find((node): node is FileNode => node.kind === "file") ??
    null;
  const activeFileId =
    workspace.activeFileId && !removeIds.has(workspace.activeFileId)
      ? workspace.activeFileId
      : fallbackFile?.id ?? "";
  const entryFileId =
    workspace.entryFileId && !removeIds.has(workspace.entryFileId)
      ? workspace.entryFileId
      : fallbackFile?.id ?? activeFileId;
  const openTabs = workspace.openTabs.filter((id) => !removeIds.has(id));

  if (activeFileId && !openTabs.includes(activeFileId)) {
    openTabs.push(activeFileId);
  }

  return {
    ...workspace,
    nodes: nextNodes,
    openTabs,
    activeFileId,
    entryFileId,
    expanded: workspace.expanded.filter((id) => !removeIds.has(id)),
  };
}

function manifestFilesForMissingMerge(
  manifest: ManifestWorkspaceDefinition,
): Array<{ path: string; content: string }> {
  /**
   * Saved/user workspaces are authoritative. Only runtime fixture files
   * should be merged back into a saved workspace. Do not merge the full
   * manifest workspace here because that workspace includes starterFiles;
   * doing so resurrects starter/helper files that the learner never saved.
   */
  return manifest.fixtureFiles;
}

function mergeMissingManifestFilesIntoWorkspace(args: {
  base: WorkspaceStateV2;
  manifest: ManifestWorkspaceDefinition;
}): WorkspaceStateV2 {
  return mergeMissingFilesIntoWorkspace({
    base: args.base,
    fixtureFiles: manifestFilesForMissingMerge(args.manifest),
  });
}

function deriveEntryCode(workspace: WorkspaceStateV2 | null | undefined) {
  if (!isWorkspace(workspace)) return "";

  const entryId = workspace.entryFileId || workspace.activeFileId;
  const entryNode =
    workspace.nodes.find((node) => node.kind === "file" && node.id === entryId) ??
    workspace.nodes.find((node) => node.kind === "file");

  return entryNode && entryNode.kind === "file"
    ? String(entryNode.content ?? "")
    : "";
}

function workspaceHasAnyFile(workspace: WorkspaceStateV2 | null | undefined) {
  return Boolean(workspace?.nodes?.some((node: any) => node?.kind === "file"));
}

function workspaceHasNonBlankFile(workspace: WorkspaceStateV2 | null | undefined) {
  if (!workspace || workspace.version !== 2 || !Array.isArray(workspace.nodes)) {
    return false;
  }

  return workspace.nodes.some((node: any) => {
    if (node?.kind !== "file") return false;
    return String(node.content ?? "").trim().length > 0;
  });
}

function normalizeWorkspaceFileContent(value: unknown) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .trim();
}

function isCollapsedMultiFileStarterSnapshot(args: {
  savedWorkspace: WorkspaceStateV2 | null | undefined;
  manifestWorkspace: WorkspaceStateV2 | null | undefined;
}) {
  const savedFiles = workspaceFileEntries(args.savedWorkspace);
  const manifestFiles = workspaceFileEntries(args.manifestWorkspace);

  if (savedFiles.length < 2 || manifestFiles.length < 2) {
    return false;
  }

  const manifestByPath = new Map(
    manifestFiles.map((file) => [
      file.path,
      normalizeWorkspaceFileContent(file.content),
    ]),
  );
  const savedByPath = new Map(
    savedFiles.map((file) => [
      file.path,
      normalizeWorkspaceFileContent(file.content),
    ]),
  );

  const manifestPaths = [...manifestByPath.keys()].sort();
  if (
    manifestPaths.some((path) => !savedByPath.has(path))
  ) {
    return false;
  }

  const manifestContents = manifestPaths
    .map((path) => manifestByPath.get(path) ?? "")
    .filter(Boolean);
  const distinctManifestContents = new Set(manifestContents);

  /**
   * The current authored workspace must actually contain distinct file
   * starters. Otherwise identical saved files may be intentional.
   */
  if (distinctManifestContents.size < 2) {
    return false;
  }

  const savedContents = manifestPaths
    .map((path) => savedByPath.get(path) ?? "")
    .filter(Boolean);
  const distinctSavedContents = new Set(savedContents);

  /**
   * Known legacy corruption:
   * one non-empty authored starter was copied into every workspace file.
   */
  if (
    savedContents.length !== manifestPaths.length ||
    distinctSavedContents.size !== 1
  ) {
    return false;
  }

  const repeatedSavedContent = savedContents[0] ?? "";
  if (!repeatedSavedContent) {
    return false;
  }

  const repeatedContentIsAuthoredStarter =
    distinctManifestContents.has(repeatedSavedContent);
  const differsFromCurrentManifest = manifestPaths.some(
    (path) =>
      (savedByPath.get(path) ?? "") !==
      (manifestByPath.get(path) ?? ""),
  );

  return (
    repeatedContentIsAuthoredStarter &&
    differsFromCurrentManifest
  );
}

function workspaceHasMeaningfulSavedContent(workspace: WorkspaceStateV2 | null | undefined) {
  if (!workspace || workspace.version !== 2 || !Array.isArray(workspace.nodes)) {
    return false;
  }

  return workspace.nodes.some((node: any) => {
    if (node?.kind !== "file") return false;

    const content = String(node.content ?? "").trim();
    if (!content) return false;

    // A raw i18n alias can be left behind by an older broken starter-code
    // resolver. It is authored metadata, not learner code.
    if (content.startsWith("@:")) return false;

    return true;
  });
}

function hasMeaningfulSavedCodeValue(value: unknown) {
  if (typeof value !== "string") return false;

  const content = value.trim();
  return Boolean(content) && !content.startsWith("@:");
}

function workspaceLanguage(workspace: WorkspaceStateV2 | null | undefined) {
  return String((workspace as any)?.language ?? "").trim().toLowerCase();
}

function workspaceContentKey(workspace: WorkspaceStateV2 | null | undefined) {
  if (!workspace || workspace.version !== 2 || !Array.isArray(workspace.nodes)) {
    return "null";
  }

  const folderPathById = new Map<string, string>();

  let changed = true;
  while (changed) {
    changed = false;

    for (const node of workspace.nodes as any[]) {
      if (!node || node.kind !== "folder") continue;

      const id = String(node.id ?? "");
      if (!id || folderPathById.has(id)) continue;

      const name = String(node.name ?? "");
      const parentId = node.parentId == null ? null : String(node.parentId);
      if (parentId && !folderPathById.has(parentId)) continue;

      const parentPath = parentId ? folderPathById.get(parentId) || "" : "";
      folderPathById.set(id, parentPath ? `${parentPath}/${name}` : name);
      changed = true;
    }
  }

  const filePath = (node: any) => {
    const name = String(node?.name ?? "");
    const parentId = node?.parentId == null ? null : String(node.parentId);
    const parentPath = parentId ? folderPathById.get(parentId) || "" : "";
    return parentPath ? `${parentPath}/${name}` : name;
  };

  const files = (workspace.nodes as any[])
    .filter((node) => node?.kind === "file")
    .map((node) => ({
      path: filePath(node),
      content: String(node.content ?? ""),
    }))
    .sort((a, b) => a.path.localeCompare(b.path));

  const activeNode = (workspace.nodes as any[]).find(
    (node) => node?.kind === "file" && node.id === workspace.activeFileId,
  );
  const entryNode = (workspace.nodes as any[]).find(
    (node) => node?.kind === "file" && node.id === workspace.entryFileId,
  );

  return JSON.stringify({
    version: 2,
    language: workspace.language ?? null,
    stdin: typeof workspace.stdin === "string" ? workspace.stdin : "",
    activePath: activeNode ? filePath(activeNode) : null,
    entryPath: entryNode ? filePath(entryNode) : null,
    files,
  });
}

function workspaceWithEntryContent(args: {
  workspace: WorkspaceStateV2;
  code?: string | null;
  stdin?: string | null;
}): WorkspaceStateV2 {
  const workspace = cloneWorkspace(args.workspace);
  const targetId =
    workspace.entryFileId ||
    workspace.activeFileId ||
    workspace.nodes.find((node) => node.kind === "file")?.id ||
    null;

  if (targetId && typeof args.code === "string") {
    workspace.nodes = workspace.nodes.map((node) => {
      if (node.kind !== "file" || node.id !== targetId) return node;
      return {
        ...node,
        content: String(args.code ?? ""),
      };
    });
  }

  if (typeof args.stdin === "string") {
    workspace.stdin = args.stdin;
  }

  return workspace;
}










function isUserWorkspaceState(value: SavedWorkspaceState | null | undefined) {
  if (!value) return false;

  const origin = String(value?.workspaceOrigin ?? "").trim().toLowerCase();

  if (value.userEdited === false) {
    return false;
  }

  return (
      value.userEdited === true ||
      origin === "user" ||
      origin === "saved" ||
      origin === "reveal-fill"
  );
}

function isPassiveWorkspaceState(value: SavedWorkspaceState | null | undefined) {
  const origin = String(value?.workspaceOrigin ?? "").trim().toLowerCase();

  return (
      value?.userEdited === false ||
      origin === "starter" ||
      origin === "manifest" ||
      origin === "default" ||
      origin === "empty" ||
      origin === "seed"
  );
}

function shouldUseSavedWorkspace(args: {
  savedState: SavedWorkspaceState;
  savedWorkspace: WorkspaceStateV2 | null;
  manifest: ManifestWorkspaceDefinition;
  language?: string | null;
}) {
  if (!args.savedWorkspace || !workspaceHasAnyFile(args.savedWorkspace)) {
    return false;
  }

  const expectedLanguage = String(
      args.language ?? workspaceLanguage(args.manifest.manifestWorkspace) ?? "",
  ).trim();

  const savedLanguage = String(
      args.savedState?.language ??
      args.savedState?.lang ??
      workspaceLanguage(args.savedWorkspace) ??
      "",
  ).trim();

  if (
      expectedLanguage &&
      savedLanguage &&
      !languagesCompatible(savedLanguage, expectedLanguage)
  ) {
    return false;
  }

  const savedHasCode = workspaceHasNonBlankFile(args.savedWorkspace);
  const savedHasMeaningfulCode = workspaceHasMeaningfulSavedContent(args.savedWorkspace);
  const savedHasLegacyCode = Boolean(
      hasMeaningfulSavedCodeValue(args.savedState.code) ||
      hasMeaningfulSavedCodeValue((args.savedState as any).source),
  );
  const manifestHasStarter =
      workspaceHasNonBlankFile(args.manifest.manifestWorkspace) ||
      Boolean(String(args.manifest.starterCode ?? "").trim());

  const userOwned = isUserWorkspaceState(args.savedState);

  /**
   * An older multi-file hydration bug copied the first SQL starter into every
   * file and then marked that snapshot as learner-owned. The current manifest
   * is authoritative when it contains distinct starters and the saved files
   * are all exact copies of one of those authored starters.
   */
  if (
    isCollapsedMultiFileStarterSnapshot({
      savedWorkspace: args.savedWorkspace,
      manifestWorkspace: args.manifest.manifestWorkspace,
    })
  ) {
    return false;
  }

  /**
   * Real learner work must win even when the course was regenerated and the
   * starter hash changed. This is the core saved > starter > default contract.
   *
   * But an old broken i18n pass could persist an empty editor shell, or even
   * the raw @: starterCode alias, as workspaceOrigin="saved". That is not
   * learner work. When the current manifest has a resolved starter, reject that
   * stale saved shell so embedded Try It cards seed the authored starter again.
   */
  if (userOwned) {
    if (!savedHasMeaningfulCode && !savedHasLegacyCode && manifestHasStarter) {
      return false;
    }

    return true;
  }

  if (!savedHasCode && !savedHasLegacyCode) {
    return false;
  }

  const savedWorkspaceKey = workspaceContentKey(args.savedWorkspace);
  const savedStarterHash =
      typeof args.savedState.starterHash === "string"
          ? args.savedState.starterHash
          : "";
  const currentStarterHash = args.manifest.starterHash;

  const matchesSavedStarter = Boolean(savedStarterHash && savedWorkspaceKey === savedStarterHash);
  const matchesCurrentStarter = Boolean(currentStarterHash && savedWorkspaceKey === currentStarterHash);

  /**
   * Passive starter/default snapshots are not learner work, but older progress
   * payloads sometimes persisted user-authored code with userEdited=false.
   * Treat passive state as rejectable only when its workspace still matches a
   * known starter snapshot. If the contents differ from both starter hashes,
   * saved progress must still beat the manifest starter.
   */
  if (isPassiveWorkspaceState(args.savedState) && (matchesSavedStarter || matchesCurrentStarter)) {
    return false;
  }

  /**
   * Legacy saved states may not have workspaceOrigin/userEdited.
   * Keep them only if they are not merely an old starter snapshot.
   */
  if (matchesSavedStarter || matchesCurrentStarter) {
    return false;
  }

  return true;
}






















function normalizeSavedCandidate(args: {
  candidate: SavedWorkspaceState;
  manifest: ManifestWorkspaceDefinition;
  language: WorkspaceLanguage;
}): WorkspaceStateV2 | null {
  if (isWorkspace(args.candidate.workspace)) {
    const workspace = sanitizeLegacyWorkspaceArtifacts({
      workspace: args.candidate.workspace,
      manifest: args.manifest,
      userOwned: isUserWorkspaceState(args.candidate),
    });
    const explicitCode =
      typeof args.candidate.code === "string" && args.candidate.code.trim()
        ? args.candidate.code
        : typeof args.candidate.source === "string" && args.candidate.source.trim()
          ? args.candidate.source
          : null;

    const workspaceEntryCode = String(deriveEntryCode(workspace) ?? "");
    const manifestEntryCode = String(deriveEntryCode(args.manifest.manifestWorkspace) ?? "");
    const shouldHydrateLegacyCode =
      explicitCode != null &&
      (
        !workspaceEntryCode.trim() ||
        (
          isUserWorkspaceState(args.candidate) &&
          workspaceEntryCode === manifestEntryCode &&
          explicitCode !== workspaceEntryCode
        )
      );

    if (shouldHydrateLegacyCode || typeof args.candidate.stdin === "string") {
      return workspaceWithEntryContent({
        workspace,
        code: shouldHydrateLegacyCode ? explicitCode : null,
        stdin: args.candidate.stdin ?? null,
      });
    }

    return workspace;
  }

  const explicitCode =
    typeof args.candidate.code === "string" && args.candidate.code.trim()
      ? args.candidate.code
      : typeof args.candidate.source === "string" && args.candidate.source.trim()
        ? args.candidate.source
        : "";
  const explicitStdin =
    typeof args.candidate.stdin === "string" ? args.candidate.stdin : "";

  if (!explicitCode.trim() && !explicitStdin.trim()) {
    return null;
  }

  if (args.manifest.manifestWorkspace) {
    return workspaceWithEntryContent({
      workspace: args.manifest.manifestWorkspace,
      code: explicitCode || null,
      stdin: explicitStdin || null,
    });
  }

  return buildDefaultWorkspace({
    language: args.language,
    entryFile: args.manifest.entryFile,
    code: explicitCode,
    stdin: explicitStdin,
  });
}

export function createManifestWorkspaceDefinition(args: {
  language: WorkspaceLanguage | string;
  manifest?: unknown;
  entry?: EntryWorkspaceFallback | null;
  workspaceRequested?: boolean;
}): ManifestWorkspaceDefinition {
  const language = (args.language || args.entry?.language || args.entry?.lang || "python") as WorkspaceLanguage;

  const entryManifest = isRecord(args.entry?.item) ? args.entry?.item : {};
  const manifest = normalizeManifestShape({
    ...entryManifest,
    ...(isRecord(args.manifest) ? args.manifest : {}),
  });

  const manifestWorkspace = isRecord(manifest.workspace) ? manifest.workspace : {};
  const manifestRecipe = isRecord(manifest.recipe) ? manifest.recipe : {};
  const explicitEntryFile = getEntryFile({ manifest, language });
  const entryFromStarterFiles =
      [
        ...collectEntryFileSources(manifest),
        args.entry?.starterFiles,
      ]
          .map((source) => getEntryFileFromStarterFiles(source))
          .find((path) => path.trim().length > 0) ?? "";
  const entryFile = entryFromStarterFiles || explicitEntryFile;
  const stdin = String(getInitialStdin(manifest) ?? "");

  const fixtureFiles = mergeNormalizedStarterFiles(
    collectManifestFixtureFileSources(manifest),
    entryFile,
  );

  const starterCode = pickNonBlankString(
      getStarterCode(manifest),
      manifestWorkspace.starterCode,
      manifest.starterCode,
      manifestRecipe.starterCode,
      args.entry?.starterCode,
  );

  let starterFiles = mergeNormalizedStarterFiles(
      [
        ...collectManifestStarterFileSources(manifest),
        args.entry?.starterFiles,
      ],
      entryFile,
  );

  const normalizedEntryFile = normalizePath(entryFile, defaultMainFile(language));
  if (isUsableStarterCode(starterCode)) {
    const entryIndex = starterFiles.findIndex(
        (file) => normalizePath(file.path, normalizedEntryFile) === normalizedEntryFile,
    );

    if (entryIndex >= 0) {
      const existing = starterFiles[entryIndex];
      if (!isUsableStarterCode(existing.content)) {
        starterFiles = starterFiles.map((file, index) =>
            index === entryIndex ? { ...file, content: starterCode } : file,
        );
      }
    }
  }

  const hasFullManifestWorkspace = Boolean(
      isWorkspace(manifest.workspace) ||
      isWorkspace((manifest as any).initialWorkspace) ||
      isWorkspace((manifest as any).starterWorkspace) ||
      isWorkspace(args.entry?.starterWorkspace) ||
      isWorkspace(args.entry?.workspace),
  );

  const hasStarterAssets = Boolean(
      starterCode.trim() ||
      hasUsableStarterFilesValue(starterFiles) ||
      hasUsableStarterFilesValue(fixtureFiles) ||
      hasFullManifestWorkspace,
  );

  const requested = Boolean(args.workspaceRequested === true || hasStarterAssets);

  const hasEntryFile = starterFiles.some(
      (file) => normalizePath(file.path, entryFile) === entryFile,
  );

  /**
   * Do not manufacture an empty main.py for non-tool cards.
   * A normal reading card with workspaceRequested=false and no manifest assets
   * must resolve to null, not an empty workspace.
   */
  if (!hasEntryFile && requested) {
    starterFiles = [
      {
        path: entryFile,
        content: starterCode.trim() ? starterCode : "",
      },
      ...starterFiles,
    ];
  }

  const combinedFiles = requested
      ? mergeNormalizedStarterFiles([starterFiles, fixtureFiles], entryFile)
      : [];

  const fullManifestWorkspace = firstWorkspace(
      manifest.workspace,
      (manifest as any).initialWorkspace,
      (manifest as any).starterWorkspace,
      args.entry?.starterWorkspace,
      args.entry?.workspace,
  );

  const workspace =
      fullManifestWorkspace
          ? mergeMissingFilesIntoWorkspace({
            base: fullManifestWorkspace,
            fixtureFiles,
          })
          : combinedFiles.length > 0
              ? buildWorkspaceFromFiles({
                language,
                entryFile,
                files: combinedFiles,
                stdin,
              })
              : requested
                  ? buildDefaultWorkspace({
                    language,
                    entryFile,
                    code: starterCode.trim() ? starterCode : "",
                    stdin,
                  })
                  : null;

  return {
    requested,
    language,
    entryFile,
    seedSource: hasStarterAssets ? "starter" : requested ? "default" : "none",
    stdin,
    starterCode,
    starterFiles,
    fixtureFiles,
    manifestWorkspace: workspace,
    starterHash: workspaceContentKey(workspace),
  };
}

export function resolveWorkspaceForTarget(args: {
  targetKey: string;
  targetKind: WorkspaceTargetKind;
  language: WorkspaceLanguage | string;
  manifest?: unknown;
  entry?: EntryWorkspaceFallback | null;
  workspaceRequested?: boolean;
  savedCandidates?: SavedWorkspaceState[];
  localDraft?: LocalDraftWorkspaceState | null;
  draftMaxAgeMs?: number;
}): ResolvedWorkspaceForTarget {
  const language = (args.language || "python") as WorkspaceLanguage;
  const manifest = createManifestWorkspaceDefinition({
    language,
    manifest: args.manifest,
    entry: args.entry,
    workspaceRequested: args.workspaceRequested ?? args.targetKind === "exercise",
  });

  const normalizedCandidates = (args.savedCandidates ?? []).map((candidate) => ({
    candidate,
    workspace: normalizeSavedCandidate({
      candidate,
      manifest,
      language,
    }),
  }));

  const freshestSavedUpdatedAt = Math.max(
    0,
    ...normalizedCandidates.map(({ candidate }) => Number(candidate.updatedAt ?? 0) || 0),
  );

  const draftMaxAgeMs = args.draftMaxAgeMs ?? 10 * 60 * 1000;
  const manifestHasStarter =
    workspaceHasNonBlankFile(manifest.manifestWorkspace) ||
    Boolean(String(manifest.starterCode ?? "").trim());
  const localDraftHasMeaningfulContent = workspaceHasMeaningfulSavedContent(
    args.localDraft?.workspace,
  );
  const localDraftIsCollapsedStarter =
    isCollapsedMultiFileStarterSnapshot({
      savedWorkspace: args.localDraft?.workspace,
      manifestWorkspace: manifest.manifestWorkspace,
    });
  const localDraftCanOverrideStarter =
    (!manifestHasStarter || localDraftHasMeaningfulContent) &&
    !localDraftIsCollapsedStarter;
  const draftIsFresh =
    args.localDraft &&
    args.localDraft.targetKey === args.targetKey &&
    isWorkspace(args.localDraft.workspace) &&
    localDraftCanOverrideStarter &&
    Date.now() - args.localDraft.savedAt <= draftMaxAgeMs &&
    args.localDraft.savedAt >= freshestSavedUpdatedAt;

  if (draftIsFresh && args.localDraft) {
    const sanitizedDraftWorkspace = sanitizeLegacyWorkspaceArtifacts({
      workspace: args.localDraft.workspace,
      manifest,
      userOwned: true,
    });
    const mergedWorkspace = manifest.manifestWorkspace
      ? mergeMissingManifestFilesIntoWorkspace({
          base: sanitizedDraftWorkspace,
          manifest,
        })
      : sanitizedDraftWorkspace;

    return {
      workspace: mergedWorkspace,
      code: deriveEntryCode(mergedWorkspace),
      stdin: String(mergedWorkspace.stdin ?? manifest.stdin ?? ""),
      language,
      source: "draft",
      starterHash: manifest.starterHash,
      manifest,
    };
  }

  for (const { candidate, workspace } of normalizedCandidates) {
    const candidateTargetKey =
      typeof candidate.targetKey === "string" ? candidate.targetKey.trim() : "";

    if (candidateTargetKey && candidateTargetKey !== args.targetKey) {
      continue;
    }

    if (
      shouldUseSavedWorkspace({
        savedState: candidate,
        savedWorkspace: workspace,
        manifest,
        language,
      }) &&
      workspace
    ) {
      const mergedWorkspace = mergeMissingManifestFilesIntoWorkspace({
        base: workspace,
        manifest,
      });

      return {
        workspace: mergedWorkspace,
        code: deriveEntryCode(mergedWorkspace),
        stdin: String(mergedWorkspace.stdin ?? manifest.stdin ?? ""),
        language,
        source: "saved",
        starterHash: manifest.starterHash,
        manifest,
      };
    }
  }

  if (manifest.manifestWorkspace) {
    return {
      workspace: cloneWorkspace(manifest.manifestWorkspace),
      code: deriveEntryCode(manifest.manifestWorkspace),
      stdin: String(manifest.manifestWorkspace.stdin ?? manifest.stdin ?? ""),
      language,
      source: manifest.seedSource === "starter" ? "manifest" : "empty",
      starterHash: manifest.starterHash,
      manifest,
    };
  }

  if (manifest.requested) {
    const workspace = buildDefaultWorkspace({
      language,
      entryFile: manifest.entryFile,
      code: "",
      stdin: manifest.stdin,
    });

    return {
      workspace,
      code: deriveEntryCode(workspace),
      stdin: String(workspace.stdin ?? ""),
      language,
      source: "empty",
      starterHash: manifest.starterHash,
      manifest,
    };
  }

  return {
    workspace: null,
    code: "",
    stdin: "",
    language,
    source: "none",
    starterHash: manifest.starterHash,
    manifest,
  };
}

export function resolveWorkspaceForExerciseTarget(args: {
  targetKey: string;
  language: WorkspaceLanguage | string;
  manifest?: unknown;
  entry?: EntryWorkspaceFallback | null;
  savedCandidates?: SavedWorkspaceState[];
  localDraft?: LocalDraftWorkspaceState | null;
  draftMaxAgeMs?: number;
}): ResolvedWorkspaceForExerciseTarget {
  const resolved = resolveWorkspaceForTarget({
    ...args,
    targetKind: "exercise",
    workspaceRequested: true,
  });

  const fallbackWorkspace = buildDefaultWorkspace({
    language: resolved.language,
    entryFile: resolved.manifest.entryFile,
    code: "",
    stdin: resolved.manifest.stdin,
  });

  return {
    workspace: resolved.workspace ?? fallbackWorkspace,
    source:
      resolved.source === "saved" || resolved.source === "draft"
        ? "saved"
        : "starter",
    entryFilePath: resolved.manifest.entryFile,
  };
}
