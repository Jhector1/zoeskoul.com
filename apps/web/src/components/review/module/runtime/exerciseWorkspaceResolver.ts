import type {
  FileNode,
  FolderNode,
  FSNode,
  NodeId,
  WorkspaceStateV2,
} from "@/components/ide/types";
import type { WorkspaceLanguage } from "@/lib/practice/types";
import { defaultMainFile } from "@/components/ide/languageDefaults";
import {
  cleanStarterCode,
  hasUsableStarterFilesValue,
  isUsableStarterCode
} from "@/components/review/module/runtime/starterContent";
import { resolveWorkspaceForTarget } from "@/components/review/module/runtime/resolveWorkspaceForTarget";

type UnknownRecord = Record<string, unknown>;




function explicitStarterCodeFromManifest(manifest: UnknownRecord) {
  // Only explicit runtime starter fields are allowed to seed the code input pane.
  // Do not fall back to generic code/content/source fields or i18n aliases,
  // because those fields may contain solution text, examples, explanations, or
  // unresolved translation keys such as `@:quiz.some_id.starterCode`.
  const workspace = isRecord(manifest.workspace) ? manifest.workspace : {};
  const recipe = isRecord(manifest.recipe) ? manifest.recipe : {};

  return (
      cleanStarterCode(workspace.starterCode) ??
      cleanStarterCode(manifest?.starterCode) ??
      cleanStarterCode(recipe.starterCode) ??
      ""
  );
}

type StarterFile =
    | string
    | {
  path?: string;
  filePath?: string;
  filename?: string;
  name?: string;
  content?: string;
  contents?: string;
  text?: string;
  code?: string;
  source?: string;
  body?: string;
  value?: string;
  entry?: boolean;
  isEntry?: boolean;
  main?: boolean;
};

function isRecord(value: unknown): value is UnknownRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
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

export function isWorkspace(value: unknown): value is WorkspaceStateV2 {
  return (
      !!value &&
      typeof value === "object" &&
      (value as WorkspaceStateV2).version === 2 &&
      Array.isArray((value as WorkspaceStateV2).nodes)
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
      return (
          node.kind === "folder" &&
          node.name === part &&
          node.parentId === parentId
      );
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













function mergeMissingFixtureFilesIntoSavedWorkspace(args: {
  saved: WorkspaceStateV2;
  language: WorkspaceLanguage;
  fixtureFiles: Array<{ path: string; content: string }>;
}): WorkspaceStateV2 {
  if (args.fixtureFiles.length === 0) {
    return cloneWorkspace(args.saved);
  }

  const workspace = cloneWorkspace(args.saved);
  const existingPaths = workspaceFilePaths(workspace);

  for (const file of args.fixtureFiles) {
    const path = normalizePath(file.path, defaultMainFile(args.language));
    if (!path || existingPaths.has(path)) continue;

    const parts = path.split("/");
    const name = parts.pop() || defaultMainFile(args.language);
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

function starterFileContent(file: StarterFile): string {
  if (typeof file === "string") return "";
  if (!isRecord(file)) return "";

  for (const key of [
    "content",
    "contents",
    "text",
    "code",
    "source",
    "body",
    "value",
  ] as const) {
    if (typeof file[key] === "string") {
      return isUsableStarterCode(file[key]) ? file[key] : "";
    }  }

  return "";
}

function unwrapStarterFiles(raw: unknown): unknown {
  if (!isRecord(raw)) return raw;

  return (
      raw.starterFiles ??
      raw.files ??
      raw.initialFiles ??
      raw.workspaceFiles ??
      raw.entries ??
      raw.items ??
      raw
  );
}

function normalizeStarterFiles(
    raw: unknown,
    fallbackEntryFile: string,
): Array<{ path: string; content: string }> {
  const files: Array<{ path: string; content: string }> = [];
  const source = unwrapStarterFiles(raw);

  if (Array.isArray(source)) {
    source.forEach((file, index) => {
      const fallback =
          index === 0 ? fallbackEntryFile : `file-${String(index + 1)}.txt`;

      files.push({
        path: normalizePath(starterFilePath(file as StarterFile, fallback), fallback),
        content: starterFileContent(file as StarterFile),
      });
    });

    return files.filter((file) => file.path);
  }

  if (isRecord(source)) {
    for (const [path, value] of Object.entries(source)) {
      if (
          [
            "entryFile",
            "entryFilePath",
            "mainFile",
            "mainFilePath",
            "language",
            "lang",
          ].includes(path)
      ) {
        continue;
      }

      files.push({
        path: normalizePath(path, fallbackEntryFile),
        content:
            typeof value === "string"
                ? isUsableStarterCode(value)
                    ? value
                    : ""
                : isRecord(value)
                    ? starterFileContent(value as StarterFile)
                    : "",
      });
    }
  }

  return files.filter((file) => file.path);
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

function hasUsableStarterFilesSource(value: unknown): boolean {
  return hasUsableStarterFilesValue(unwrapStarterFiles(value));
}

function firstUsableStarterFilesSource(...values: Array<unknown>) {
  for (const value of values) {
    if (hasUsableStarterFilesSource(value)) return value;
  }

  return null;
}

function collectStarterFilesSources(manifest: UnknownRecord) {
  const normalized = normalizeManifestShape(manifest);
  const workspace = isRecord(normalized.workspace) ? normalized.workspace : {};
  const recipe = isRecord(normalized.recipe) ? normalized.recipe : {};

  return [
      workspace.starterFiles,
      workspace.files,
      workspace.initialFiles,
      workspace.workspaceFiles,
      workspace.fixtureFiles,
      workspace.fixtures,
      workspace.fileFixtures,
      normalized.starterFiles,
      normalized.files,
      normalized.initialFiles,
      normalized.workspaceFiles,
      normalized.fixtureFiles,
      normalized.fixtures,
      normalized.fileFixtures,
      recipe.starterFiles,
      recipe.files,
      recipe.initialFiles,
      recipe.workspaceFiles,
      recipe.fixtureFiles,
      recipe.fixtures,
      recipe.fileFixtures,
  ];
}





function collectWorkspaceFixtureFileSources(manifest: UnknownRecord) {
  const normalized = normalizeManifestShape(manifest);
  const workspace = isRecord(normalized.workspace) ? normalized.workspace : {};
  const recipe = isRecord(normalized.recipe) ? normalized.recipe : {};

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
    recipe.workspaceFiles,
    recipe.fixtureFiles,
    recipe.fixtures,
    recipe.fileFixtures,
  ];
}
export function getStarterFilesSource(manifest: UnknownRecord) {
  return firstUsableStarterFilesSource(...collectStarterFilesSources(manifest));
}

function mergeNormalizedStarterFiles(
    sources: Array<unknown>,
    fallbackEntryFile: string,
): Array<{ path: string; content: string }> {
  const byPath = new Map<string, { path: string; content: string }>();

  for (const source of sources) {
    const normalized = normalizeStarterFiles(source, fallbackEntryFile);

    for (const file of normalized) {
      const path = normalizePath(file.path, fallbackEntryFile);
      if (!path || byPath.has(path)) continue;

      byPath.set(path, {
        path,
        content: file.content ?? "",
      });
    }
  }

  return Array.from(byPath.values());
}

function collectEntryFileSources(args: {
  manifest: UnknownRecord;
  entry?: import("./reviewTargetRegistry").ReviewTargetEntry | null;
}) {
  const manifestWorkspace = isRecord(args.manifest.workspace)
      ? args.manifest.workspace
      : {};
  const manifestRecipe = isRecord(args.manifest.recipe) ? args.manifest.recipe : {};

  return [
    manifestWorkspace.starterFiles,
    args.manifest.starterFiles,
    args.entry?.starterFiles,
    manifestRecipe.starterFiles,
  ];
}

export function getStarterCode(manifest: UnknownRecord) {
  return explicitStarterCodeFromManifest(manifest);
}

function pickNonBlankString(...values: Array<unknown>) {
  for (const value of values) {
    if (isUsableStarterCode(value)) return value;
  }
  return "";
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

function buildWorkspaceFromStarterFiles(args: {
  language: WorkspaceLanguage;
  entryFile: string;
  starterFiles: Array<{ path: string; content: string }>;
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

  for (const file of args.starterFiles) {
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
  const normalizedEntry = normalizePath(
      args.entryFile,
      defaultMainFile(args.language),
  );
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

function isWorkspaceStateV2(value: unknown): value is WorkspaceStateV2 {
  return (
      !!value &&
      typeof value === "object" &&
      (value as WorkspaceStateV2).version === 2 &&
      Array.isArray((value as WorkspaceStateV2).nodes)
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
function hasUsableWorkspaceContent(
    workspace: WorkspaceStateV2 | null | undefined,
): boolean {
  if (!isWorkspaceStateV2(workspace)) {
    return false;
  }

  return workspace.nodes.some((node) => {
    if (node.kind !== "file") {
      return false;
    }

    return String(node.content ?? "").trim().length > 0;
  });
}
function getEntryFileFromStarterFiles(raw: unknown): string {
  const source = unwrapStarterFiles(raw);
  if (!Array.isArray(source)) return "";

  const entry = source.find((file) => {
    if (!isRecord(file)) return false;
    return file.entry === true || file.isEntry === true || file.main === true;
  });

  return entry ? starterFilePath(entry as StarterFile, "") : "";
}

export function resolveExerciseWorkspace(args: {
  language: WorkspaceLanguage | string;
  manifest: unknown;
  saved?: WorkspaceStateV2 | null;
  entry?: import("./reviewTargetRegistry").ReviewTargetEntry | null;
}): WorkspaceStateV2 {
  const language = (args.language || args.entry?.language || "python") as WorkspaceLanguage;
  const resolved = resolveWorkspaceForTarget({
    targetKey: args.entry?.targetKey ?? "exercise",
    targetKind: "exercise",
    language,
    manifest: args.manifest ?? args.entry?.item ?? {},
    entry: args.entry,
    workspaceRequested: true,
    savedCandidates: args.saved
      ? [
          {
            workspace: args.saved,
            language,
            lang: language,
            userEdited: true,
            workspaceOrigin: "saved",
          },
        ]
      : [],
  });

  return resolved.workspace ?? buildDefaultWorkspace({
    language,
    entryFile: defaultMainFile(language),
    code: "",
    stdin: "",
  });
}
