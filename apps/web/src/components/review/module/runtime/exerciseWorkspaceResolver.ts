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

export function getStarterFilesSource(manifest: UnknownRecord) {
  const normalized = normalizeManifestShape(manifest);
  const workspace = isRecord(normalized.workspace) ? normalized.workspace : {};
  const recipe = isRecord(normalized.recipe) ? normalized.recipe : {};

  return firstUsableStarterFilesSource(
      workspace.starterFiles,
      workspace.files,
      workspace.initialFiles,
      workspace.workspaceFiles,
      normalized.starterFiles,
      normalized.files,
      normalized.initialFiles,
      normalized.workspaceFiles,
      recipe.starterFiles,
      recipe.files,
      recipe.initialFiles,
  );
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
  const language = (args.language ||
      args.entry?.language ||
      "python") as WorkspaceLanguage;

  const manifest = normalizeManifestShape(args.manifest ?? args.entry?.item ?? {});
  const manifestWorkspace = isRecord(manifest.workspace) ? manifest.workspace : {};
  const manifestRecipe = isRecord(manifest.recipe) ? manifest.recipe : {};

  // Preserve real saved user work when the runtime intentionally passes it in.
  // This prevents user edits from being overwritten on refresh/re-render.
  // But ignore blank saved workspaces so empty DB state does not hide starter code.
  if (isWorkspace(args.saved) && hasUsableWorkspaceContent(args.saved)) {
    return cloneWorkspace(args.saved);
  }

  // If the registry already has a complete starter workspace, use it.
  if (args.entry?.starterWorkspace && isWorkspace(args.entry.starterWorkspace)) {
    return cloneWorkspace(args.entry.starterWorkspace);
  }

  const savedFromManifest =
      isWorkspace(manifest.workspace)
          ? manifest.workspace
          : manifest.initialWorkspace && isWorkspace(manifest.initialWorkspace)
              ? manifest.initialWorkspace
              : manifest.starterWorkspace && isWorkspace(manifest.starterWorkspace)
                  ? manifest.starterWorkspace
                  : null;

  if (savedFromManifest) {
    return cloneWorkspace(savedFromManifest);
  }

  const starterFilesSource = firstUsableStarterFilesSource(
      getStarterFilesSource(manifest),
      args.entry?.starterFiles,
  );

  const explicitEntryFile = getEntryFile({ manifest, language });
  const entryFromStarterFiles = getEntryFileFromStarterFiles(starterFilesSource);
  const entryFile = entryFromStarterFiles || explicitEntryFile;
  const stdin = String(getInitialStdin(manifest) ?? "");

  const starterCode = pickNonBlankString(
      getStarterCode(manifest),
      args.entry?.starterCode,
      manifestWorkspace.starterCode,
      manifest.starterCode,
      manifestRecipe.starterCode,
  );

  let starterFiles = normalizeStarterFiles(starterFilesSource, entryFile);

  // Critical single-file fix:
  // If this exercise only has explicit starterCode, convert it into a normal
  // one-file starterFiles workspace.
  // That makes single-file and multi-file starters use the same builder.
  if (starterFiles.length === 0 && starterCode.trim()) {
    starterFiles = [
      {
        path: entryFile,
        content: starterCode,
      },
    ];
  }

  if (starterFiles.length > 0) {
    return buildWorkspaceFromStarterFiles({
      language,
      entryFile,
      starterFiles,
      stdin,
    });
  }

  return buildDefaultWorkspace({
    language,
    entryFile,
    code: "",
    stdin,
  });
}
