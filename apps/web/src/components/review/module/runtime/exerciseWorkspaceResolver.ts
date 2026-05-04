import type {
  FileNode,
  FolderNode,
  FSNode,
  NodeId,
  WorkspaceStateV2,
} from "@/components/ide/types";
import type { WorkspaceLanguage } from "@/lib/practice/types";
import { defaultMainFile } from "@/components/ide/languageDefaults";

type AnyRecord = Record<string, any>;



function looksLikePythonStarterCode(value: string) {
  const s = String(value ?? "").trim();
  if (!s) return false;
  if (s.length > 3000) return false;

  return (
      /\bprint\s*\(/.test(s) ||
      /\binput\s*\(/.test(s) ||
      /\bint\s*\(/.test(s) ||
      /\bfloat\s*\(/.test(s) ||
      /\bstr\s*\(/.test(s) ||
      /\bdef\s+[a-zA-Z_][a-zA-Z0-9_]*\s*\(/.test(s) ||
      /^\s*[a-zA-Z_][a-zA-Z0-9_]*\s*=/.test(s) ||
      /#\s*TODO/i.test(s)
  );
}

function extractCodeFence(value: string) {
  const source = String(value ?? "");
  const preferred = source.match(/```(?:python|py)\s*([\s\S]*?)```/i);
  if (preferred?.[1]?.trim()) return preferred[1].trim();

  const generic = source.match(/```\s*([\s\S]*?)```/);
  if (generic?.[1]?.trim() && looksLikePythonStarterCode(generic[1])) {
    return generic[1].trim();
  }

  return "";
}

function extractStarterCodeFromLooseContent(input: unknown, seen = new WeakSet<object>()): string {
  if (input == null) return "";

  if (typeof input === "string") {
    const fenced = extractCodeFence(input);
    if (fenced) return fenced;
    return looksLikePythonStarterCode(input) ? input.trim() : "";
  }

  if (typeof input !== "object") return "";

  if (seen.has(input as object)) return "";
  seen.add(input as object);

  if (Array.isArray(input)) {
    for (const item of input) {
      const found = extractStarterCodeFromLooseContent(item, seen);
      if (found) return found;
    }
    return "";
  }

  const obj = input as Record<string, unknown>;

  const preferredKeys = [
    "starterCode",
    "solutionCode",
    "solutionTemplate",
    "code",
    "content",
    "content",
    "source",
    "body",
    "markdown",
    "md",
    "text",
    "prompt",
    "instructions",
    "description",
    "example",
    "examples",
    "steps",
    "cards",
    "blocks",
    "children",
    "items",
    "recipe",
    "workspace",
  ];

  for (const key of preferredKeys) {
    if (key in obj) {
      const found = extractStarterCodeFromLooseContent(obj[key], seen);
      if (found) return found;
    }
  }

  for (const [key, value] of Object.entries(obj)) {
    if (preferredKeys.includes(key)) continue;
    const found = extractStarterCodeFromLooseContent(value, seen);
    if (found) return found;
  }

  return "";
}

function explicitStarterCodeFromManifest(manifest: any) {
  const explicit =
      manifest?.workspace?.solutionCode ??
      manifest?.workspace?.starterCode ??
      manifest?.workspace?.code ??
      manifest?.workspace?.content ??
      manifest?.workspace?.source ??
      manifest?.solutionCode ??
      manifest?.starterCode ??
      manifest?.code ??
      manifest?.content ??
      manifest?.source ??
      manifest?.recipe?.solutionCode ??
      manifest?.recipe?.starterCode ??
      manifest?.recipe?.solutionTemplate ??
      manifest?.solutionTemplate ??
      "";

  const explicitString = String(explicit ?? "").trim();
  if (explicitString) return explicitString;

  return extractStarterCodeFromLooseContent(manifest);
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

function isRecord(value: unknown): value is AnyRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeManifestShape(input: unknown): AnyRecord {
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

function starterFileContent(file: StarterFile): string {
  if (typeof file === "string") return "";
  if (!isRecord(file)) return "";

  for (const key of ["content", "contents", "text", "code", "source", "body", "value"] as const) {
    if (typeof file[key] === "string") return file[key];
  }

  return "";
}

function unwrapStarterFiles(raw: unknown): unknown {
  if (!isRecord(raw)) return raw;

  return (
      raw.solutionFiles ??
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
      if (["entryFile", "entryFilePath", "mainFile", "mainFilePath", "language", "lang"].includes(path)) {
        continue;
      }

      files.push({
        path: normalizePath(path, fallbackEntryFile),
        content:
            typeof value === "string"
                ? value
                : isRecord(value)
                    ? starterFileContent(value as StarterFile)
                    : "",
      });
    }
  }

  return files.filter((file) => file.path);
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

export function getStarterFilesSource(manifest: AnyRecord) {
  const normalized = normalizeManifestShape(manifest);
  return (
      normalized.workspace?.solutionFiles ??
      normalized.workspace?.starterFiles ??
      normalized.workspace?.files ??
      normalized.workspace?.initialFiles ??
      normalized.workspace?.workspaceFiles ??
      normalized.solutionFiles ??
      normalized.starterFiles ??
      normalized.files ??
      normalized.initialFiles ??
      normalized.workspaceFiles ??
      normalized.recipe?.solutionFiles ??
      normalized.recipe?.starterFiles ??
      normalized.recipe?.files ??
      normalized.recipe?.initialFiles ??
      null
  );
}

export function getStarterCode(manifest: AnyRecord) {
  return explicitStarterCodeFromManifest(manifest);
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
  // Starter workspaces must be deterministic. If ids/timestamps change on
  // every resolve, FullIDE/Monaco receives a new model key and can stay stuck
  // in Loading... while hydration repeats.
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
  // Keep default/no-starter workspaces deterministic too. A blank default
  // workspace should not get a new file id on every render/hydration.
  const now = 0;
  const id = stableStarterNodeId("file", normalizePath(args.entryFile, defaultMainFile(args.language)));
  const normalizedEntry = normalizePath(args.entryFile, defaultMainFile(args.language));
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
  manifest: any;
  saved?: WorkspaceStateV2 | null;
  entry?: import("./reviewTargetRegistry").ReviewTargetEntry | null;
}): WorkspaceStateV2 {
  const language = (args.language || args.entry?.language || "python") as WorkspaceLanguage;
  const manifest = normalizeManifestShape(args.manifest ?? args.entry?.item ?? {});
  const starterFilesSource = getStarterFilesSource(manifest) || args.entry?.starterFiles;
  const explicitEntryFile = getEntryFile({ manifest, language });
  const entryFromStarterFiles = getEntryFileFromStarterFiles(starterFilesSource);
  const entryFile = entryFromStarterFiles || explicitEntryFile;
  const stdin = String(getInitialStdin(manifest) ?? "");
  const starterWorkspace =
      args.entry?.starterWorkspace && isWorkspace(args.entry.starterWorkspace)
          ? args.entry.starterWorkspace
          : manifest.workspace && isWorkspace(manifest.workspace)
              ? manifest.workspace
              : manifest.initialWorkspace && isWorkspace(manifest.initialWorkspace)
                  ? manifest.initialWorkspace
                  : manifest.starterWorkspace && isWorkspace(manifest.starterWorkspace)
                      ? manifest.starterWorkspace
                      : null;

  if (starterWorkspace) {
    return cloneWorkspace(starterWorkspace);
  }

  const starterFiles = normalizeStarterFiles(
      starterFilesSource,
      entryFile,
  );

  if (starterFiles.length > 0) {
    const starterWorkspace = buildWorkspaceFromStarterFiles({
      language,
      entryFile,
      starterFiles,
      stdin,
    });

    const starterCode = getStarterCode(manifest) || args.entry?.starterCode;
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

  if (isWorkspace(args.saved)) {
    return cloneWorkspace(args.saved);
  }

  return buildDefaultWorkspace({
    language,
    entryFile,
    code: String(getStarterCode(manifest) ?? args.entry?.starterCode ?? ""),
    stdin,
  });
}
