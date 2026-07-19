import { z } from "zod";

export type WorkspaceFileViewer =
  | "editor"
  | "image"
  | "pdf"
  | "audio"
  | "video"
  | "font"
  | "archive"
  | "details";

export type WorkspaceFileCapability = {
  storage: "text" | "binary";
  viewer: WorkspaceFileViewer;
  mimeType: string;
  editable: boolean;
  /** Monaco-compatible syntax id for text files. */
  editorLanguage?: string;
};

/**
 * One canonical capability registry shared by the browser, API, and runner.
 * Keep policy here instead of maintaining extension allowlists in each layer.
 */
export const WORKSPACE_TEXT_EXTENSIONS = [
  ".html", ".htm", ".css", ".scss", ".sass", ".less", ".styl",
  ".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts",
  ".vue", ".svelte", ".astro", ".svg", ".webmanifest", ".map",
  ".py", ".pyi", ".java", ".kt", ".kts", ".groovy", ".gradle",
  ".c", ".cc", ".cpp", ".cxx", ".h", ".hh", ".hpp", ".hxx",
  ".cs", ".fs", ".fsx", ".go", ".rs", ".rb", ".php", ".swift",
  ".dart", ".lua", ".r", ".pl", ".pm", ".ex", ".exs", ".erl",
  ".hrl", ".clj", ".cljs", ".cljc", ".edn", ".scala", ".sc",
  ".sh", ".bash", ".zsh", ".fish", ".ps1", ".txt", ".md", ".mdx",
  ".json", ".jsonc", ".yaml", ".yml", ".toml", ".ini", ".cfg",
  ".conf", ".properties", ".xml", ".csv", ".tsv", ".sql", ".graphql",
  ".gql", ".proto", ".prisma", ".tf", ".tfvars", ".hcl", ".ejs",
  ".hbs", ".handlebars", ".pug", ".njk", ".liquid", ".lock", ".mod",
  ".sum", ".tmp", ".log",
] as const;

export const WORKSPACE_TEXT_BASENAMES = [
  "Makefile", "Dockerfile", "Containerfile", "Procfile", "Gemfile",
  "Rakefile", "Vagrantfile", "Justfile", "Taskfile", "README", "README.md",
  "readme.md", "LICENSE", "LICENSE.md", "NOTICE", "CODEOWNERS", ".keep",
] as const;

export const WORKSPACE_BINARY_CAPABILITIES = {
  ".png": { viewer: "image", mimeType: "image/png" },
  ".jpg": { viewer: "image", mimeType: "image/jpeg" },
  ".jpeg": { viewer: "image", mimeType: "image/jpeg" },
  ".gif": { viewer: "image", mimeType: "image/gif" },
  ".webp": { viewer: "image", mimeType: "image/webp" },
  ".avif": { viewer: "image", mimeType: "image/avif" },
  ".bmp": { viewer: "image", mimeType: "image/bmp" },
  ".ico": { viewer: "image", mimeType: "image/x-icon" },
  ".pdf": { viewer: "pdf", mimeType: "application/pdf" },
  ".mp3": { viewer: "audio", mimeType: "audio/mpeg" },
  ".wav": { viewer: "audio", mimeType: "audio/wav" },
  ".ogg": { viewer: "audio", mimeType: "audio/ogg" },
  ".oga": { viewer: "audio", mimeType: "audio/ogg" },
  ".m4a": { viewer: "audio", mimeType: "audio/mp4" },
  ".aac": { viewer: "audio", mimeType: "audio/aac" },
  ".flac": { viewer: "audio", mimeType: "audio/flac" },
  ".mp4": { viewer: "video", mimeType: "video/mp4" },
  ".webm": { viewer: "video", mimeType: "video/webm" },
  ".ogv": { viewer: "video", mimeType: "video/ogg" },
  ".mov": { viewer: "video", mimeType: "video/quicktime" },
  ".woff": { viewer: "font", mimeType: "font/woff" },
  ".woff2": { viewer: "font", mimeType: "font/woff2" },
  ".ttf": { viewer: "font", mimeType: "font/ttf" },
  ".otf": { viewer: "font", mimeType: "font/otf" },
  ".zip": { viewer: "archive", mimeType: "application/zip" },
  ".tar": { viewer: "archive", mimeType: "application/x-tar" },
  ".gz": { viewer: "archive", mimeType: "application/gzip" },
  ".tgz": { viewer: "archive", mimeType: "application/gzip" },
  ".7z": { viewer: "archive", mimeType: "application/x-7z-compressed" },
  ".rar": { viewer: "archive", mimeType: "application/vnd.rar" },
  ".jar": { viewer: "archive", mimeType: "application/java-archive" },
  ".war": { viewer: "archive", mimeType: "application/java-archive" },
  ".epub": { viewer: "archive", mimeType: "application/epub+zip" },
  ".doc": { viewer: "details", mimeType: "application/msword" },
  ".docx": {
    viewer: "details",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
  ".xls": { viewer: "details", mimeType: "application/vnd.ms-excel" },
  ".xlsx": {
    viewer: "details",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
  ".ppt": { viewer: "details", mimeType: "application/vnd.ms-powerpoint" },
  ".pptx": {
    viewer: "details",
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  },
  ".odt": { viewer: "details", mimeType: "application/vnd.oasis.opendocument.text" },
  ".ods": { viewer: "details", mimeType: "application/vnd.oasis.opendocument.spreadsheet" },
  ".odp": { viewer: "details", mimeType: "application/vnd.oasis.opendocument.presentation" },
  ".sqlite": { viewer: "details", mimeType: "application/vnd.sqlite3" },
  ".sqlite3": { viewer: "details", mimeType: "application/vnd.sqlite3" },
  ".db": { viewer: "details", mimeType: "application/octet-stream" },
  ".wasm": { viewer: "details", mimeType: "application/wasm" },
} as const satisfies Record<
  string,
  { viewer: Exclude<WorkspaceFileViewer, "editor">; mimeType: string }
>;

export const WORKSPACE_DENIED_HIDDEN_BASENAMES = [
  ".bash_history",
  ".git",
  ".DS_Store",
  ".ssh",
  ".env",
] as const;

/**
 * Control-plane and credential directories are never learner workspace files.
 * `.zoeskoul` is intentionally not listed because authored hidden setup files
 * are transported through the same workspace contract and filtered from the UI.
 */
export const WORKSPACE_DENIED_PATH_SEGMENTS = [".git", ".ssh"] as const;

export const WORKSPACE_EDITOR_LANGUAGE_BY_BASENAME: Readonly<Record<string, string>> = {
  Dockerfile: "dockerfile",
  Containerfile: "dockerfile",
  "README.md": "markdown",
  "readme.md": "markdown",
  "LICENSE.md": "markdown",
};

export const WORKSPACE_EDITOR_LANGUAGE_BY_EXTENSION: Readonly<Record<string, string>> = {
  ".html": "html", ".htm": "html", ".css": "css", ".scss": "scss",
  ".sass": "scss", ".less": "less", ".js": "javascript", ".jsx": "javascript",
  ".mjs": "javascript", ".cjs": "javascript", ".ts": "typescript",
  ".tsx": "typescript", ".mts": "typescript", ".cts": "typescript",
  ".json": "json", ".jsonc": "json", ".webmanifest": "json", ".map": "json",
  ".md": "markdown", ".mdx": "markdown", ".xml": "xml", ".svg": "xml",
  ".yaml": "yaml", ".yml": "yaml", ".py": "python", ".pyi": "python",
  ".java": "java", ".c": "cpp", ".cc": "cpp", ".cpp": "cpp",
  ".cxx": "cpp", ".h": "cpp", ".hh": "cpp", ".hpp": "cpp",
  ".hxx": "cpp", ".cs": "csharp", ".go": "go", ".rs": "rust",
  ".rb": "ruby", ".php": "php", ".swift": "swift", ".kt": "kotlin",
  ".kts": "kotlin", ".sh": "shell", ".bash": "shell", ".zsh": "shell",
  ".fish": "shell", ".ps1": "powershell", ".sql": "sql",
  ".graphql": "graphql", ".gql": "graphql", ".ini": "ini", ".cfg": "ini",
  ".conf": "ini", ".toml": "ini", ".properties": "ini",
};


export function normalizeWorkspaceRelativePath(input: unknown) {
  return String(input ?? "").replace(/\\/g, "/").trim();
}

export function isSafeWorkspaceRelativePath(input: unknown) {
  const normalized = normalizeWorkspaceRelativePath(input);
  if (!normalized || normalized.startsWith("/") || normalized.includes("\0")) {
    return false;
  }
  if (/^[A-Za-z]:\//.test(normalized)) return false;

  const parts = normalized.split("/");
  return parts.every((part) => Boolean(part) && part !== "." && part !== "..");
}

export function assertWorkspaceRelativePath(input: unknown) {
  const normalized = normalizeWorkspaceRelativePath(input);
  if (!isSafeWorkspaceRelativePath(normalized)) {
    throw new Error(`Unsafe path: ${String(input ?? "")}`);
  }
  return normalized;
}

const TEXT_EXTENSIONS = new Set<string>(WORKSPACE_TEXT_EXTENSIONS);
const TEXT_BASENAMES = new Set<string>(WORKSPACE_TEXT_BASENAMES);
const DENIED_HIDDEN_BASENAMES = new Set<string>(
  WORKSPACE_DENIED_HIDDEN_BASENAMES,
);
const DENIED_PATH_SEGMENTS = new Set<string>(WORKSPACE_DENIED_PATH_SEGMENTS);

function basenameOf(input: string) {
  const normalized = normalizeWorkspaceRelativePath(input);
  return normalized.split("/").filter(Boolean).pop() ?? "";
}

function extensionOf(base: string) {
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot).toLowerCase() : "";
}

function isAllowedHiddenTextFile(base: string) {
  if (!base.startsWith(".") || base.length <= 1) return false;
  if (DENIED_HIDDEN_BASENAMES.has(base)) return false;
  if (base.startsWith(".env.")) return false;
  return /^\.[A-Za-z0-9._-]+$/.test(base);
}

export function resolveWorkspaceFileCapability(
  filePath: string,
): WorkspaceFileCapability | null {
  if (!isSafeWorkspaceRelativePath(filePath)) return null;
  const normalizedPath = normalizeWorkspaceRelativePath(filePath);
  const pathParts = normalizedPath.split("/");
  if (pathParts.some((part) => DENIED_PATH_SEGMENTS.has(part))) return null;

  const base = basenameOf(normalizedPath);
  if (!base) return null;

  if (isAllowedHiddenTextFile(base) || TEXT_BASENAMES.has(base)) {
    return {
      storage: "text",
      viewer: "editor",
      mimeType: "text/plain",
      editable: true,
      editorLanguage:
        WORKSPACE_EDITOR_LANGUAGE_BY_BASENAME[base] ?? "plaintext",
    };
  }

  const ext = extensionOf(base);
  if (TEXT_EXTENSIONS.has(ext)) {
    return {
      storage: "text",
      viewer: "editor",
      mimeType:
        ext === ".svg"
          ? "image/svg+xml"
          : ext === ".html" || ext === ".htm"
            ? "text/html"
            : ext === ".css"
              ? "text/css"
              : ext === ".json" || ext === ".jsonc" || ext === ".webmanifest"
                ? "application/json"
                : ext === ".js" || ext === ".mjs" || ext === ".cjs"
                  ? "text/javascript"
                  : ext === ".ts" || ext === ".mts" || ext === ".cts"
                    ? "text/typescript"
                    : ext === ".xml"
                      ? "application/xml"
                      : ext === ".yaml" || ext === ".yml"
                        ? "application/yaml"
                        : ext === ".csv"
                          ? "text/csv"
                          : ext === ".md" || ext === ".mdx"
                            ? "text/markdown"
                            : "text/plain",
      editable: true,
      editorLanguage: WORKSPACE_EDITOR_LANGUAGE_BY_EXTENSION[ext] ?? "plaintext",
    };
  }

  const binary = WORKSPACE_BINARY_CAPABILITIES[
    ext as keyof typeof WORKSPACE_BINARY_CAPABILITIES
  ];
  if (!binary) return null;

  return {
    storage: "binary",
    viewer: binary.viewer,
    mimeType: binary.mimeType,
    editable: false,
  };
}

export function resolveWorkspaceEditorLanguage(
  filePath: string,
  fallback = "plaintext",
) {
  const capability = resolveWorkspaceFileCapability(filePath);
  return capability?.storage === "text"
    ? capability.editorLanguage ?? fallback
    : fallback;
}

/** Returns canonical, whitespace-free base64, or null when invalid. */
export function normalizeWorkspaceBase64(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const source = value.replace(/\s+/g, "");
  if (!source) return "";
  if (source.length % 4 !== 0) return null;
  if (
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      source,
    )
  ) {
    return null;
  }
  return source;
}

export function workspaceBase64DecodedByteLength(value: unknown): number | null {
  const normalized = normalizeWorkspaceBase64(value);
  if (normalized == null) return null;
  if (!normalized) return 0;

  const padding = normalized.endsWith("==")
    ? 2
    : normalized.endsWith("=")
      ? 1
      : 0;
  return (normalized.length / 4) * 3 - padding;
}

export const textWorkspaceFileEntrySchema = z
  .object({
    kind: z.literal("file").optional(),
    path: z.string().min(1),
    encoding: z.literal("utf8").optional(),
    content: z.string(),
    mimeType: z.string().min(1).optional(),
  })
  .strict();

export const binaryWorkspaceFileEntrySchema = z
  .object({
    kind: z.literal("file").optional(),
    path: z.string().min(1),
    encoding: z.literal("base64"),
    data: z.string(),
    mimeType: z.string().min(1),
    sizeBytes: z.number().int().nonnegative(),
    checksum: z.string().regex(/^sha256:[a-f0-9]{64}$/i).optional(),
  })
  .strict()
  .superRefine((entry, ctx) => {
    const decodedBytes = workspaceBase64DecodedByteLength(entry.data);
    if (decodedBytes == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["data"],
        message: "Binary workspace data must be canonical base64.",
      });
      return;
    }
    if (decodedBytes !== entry.sizeBytes) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sizeBytes"],
        message: "Binary workspace sizeBytes must match the decoded payload.",
      });
    }
  });

export type TextWorkspaceFileEntry = z.infer<typeof textWorkspaceFileEntrySchema>;
export type BinaryWorkspaceFileEntry = z.infer<typeof binaryWorkspaceFileEntrySchema>;
export type WorkspaceFileEntry = TextWorkspaceFileEntry | BinaryWorkspaceFileEntry;

export function isBinaryWorkspaceFileEntry(
  entry: WorkspaceFileEntry | null | undefined,
): entry is BinaryWorkspaceFileEntry {
  return entry?.encoding === "base64";
}

export function isTextWorkspaceFileEntry(
  entry: WorkspaceFileEntry | null | undefined,
): entry is TextWorkspaceFileEntry {
  return !!entry && entry.encoding !== "base64";
}
