export const BUILD_EXECUTOR_PROTOCOL_VERSION = 1 as const;

export const TRUSTED_BUILD_OPERATIONS = ["dependency-lock-bootstrap"] as const;
export type TrustedBuildOperation = (typeof TRUSTED_BUILD_OPERATIONS)[number];

export const BUILD_EXECUTOR_LIMITS = {
  files: 300,
  fileBytes: 2 * 1024 * 1024,
  totalTextBytes: 6 * 1024 * 1024,
  idChars: 160,
  stackIdChars: 80,
  templateIdChars: 80,
} as const;

export type BuildExecutorTextFile = Readonly<{ path: string; content: string }>;

export type DependencyLockBootstrapJobRequestV1 = Readonly<{
  protocolVersion: typeof BUILD_EXECUTOR_PROTOCOL_VERSION;
  operation: "dependency-lock-bootstrap";
  buildProjectId: string;
  sourceVersion: number;
  stackId: string;
  templateId: string;
  files: readonly BuildExecutorTextFile[];
}>;

export type TrustedBuildJobRequest = DependencyLockBootstrapJobRequestV1;

export type TrustedBuildJobValidationResponse = Readonly<{
  ok: true;
  validation: Readonly<{
    protocolVersion: typeof BUILD_EXECUTOR_PROTOCOL_VERSION;
    operation: TrustedBuildOperation;
    buildProjectId: string;
    sourceVersion: number;
    executorProfileId: string;
    outputPaths: readonly string[];
    fileCount: number;
  }>;
}>;

export class BuildExecutorContractError extends Error {
  readonly code = "BUILD_EXECUTOR_REQUEST_INVALID" as const;
  constructor(message: string) {
    super(message);
    this.name = "BuildExecutorContractError";
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function boundedId(value: unknown, label: string, maxChars: number): string {
  if (typeof value !== "string") {
    throw new BuildExecutorContractError(`${label} must be a string.`);
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > maxChars) {
    throw new BuildExecutorContractError(`${label} must contain 1-${maxChars} characters.`);
  }
  return normalized;
}

function safeRelativePath(value: unknown): string {
  if (typeof value !== "string") {
    throw new BuildExecutorContractError("Executor file path must be a string.");
  }
  const path = value.trim();
  if (!path || path !== value || path.startsWith("/") || path.includes("\\") || path.includes("\0")) {
    throw new BuildExecutorContractError(`Unsafe executor file path: ${JSON.stringify(value)}.`);
  }
  if (path.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new BuildExecutorContractError(`Unsafe executor file path: ${path}.`);
  }
  return path;
}

function utf8ByteLength(value: string): number {
  let bytes = 0;

  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);

    if (code < 0x80) {
      bytes += 1;
      continue;
    }

    if (code < 0x800) {
      bytes += 2;
      continue;
    }

    if (
      code >= 0xd800 &&
      code <= 0xdbff &&
      index + 1 < value.length
    ) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
        continue;
      }
    }

    // Three bytes covers normal BMP code points and the replacement encoding
    // used for an unmatched UTF-16 surrogate.
    bytes += 3;
  }

  return bytes;
}

function parseFiles(value: unknown): BuildExecutorTextFile[] {
  if (!Array.isArray(value)) {
    throw new BuildExecutorContractError("Executor files must be an array.");
  }
  if (value.length === 0 || value.length > BUILD_EXECUTOR_LIMITS.files) {
    throw new BuildExecutorContractError(`Executor files must contain 1-${BUILD_EXECUTOR_LIMITS.files} entries.`);
  }

  const files: BuildExecutorTextFile[] = [];
  const seen = new Set<string>();
  let totalBytes = 0;

  for (const raw of value) {
    const file = asRecord(raw);
    if (!file) throw new BuildExecutorContractError("Every executor file must be an object.");
    for (const key of Object.keys(file)) {
      if (key !== "path" && key !== "content") {
        throw new BuildExecutorContractError(`Unknown executor file field: ${key}.`);
      }
    }

    const path = safeRelativePath(file.path);
    const duplicateKey = path.toLocaleLowerCase();
    if (seen.has(duplicateKey)) {
      throw new BuildExecutorContractError(`Duplicate executor file path: ${path}.`);
    }
    seen.add(duplicateKey);

    if (typeof file.content !== "string") {
      throw new BuildExecutorContractError(`Executor file ${path} must contain text content.`);
    }
    const bytes = utf8ByteLength(file.content);
    if (bytes > BUILD_EXECUTOR_LIMITS.fileBytes) {
      throw new BuildExecutorContractError(`Executor file ${path} exceeds the per-file byte limit.`);
    }
    totalBytes += bytes;
    if (totalBytes > BUILD_EXECUTOR_LIMITS.totalTextBytes) {
      throw new BuildExecutorContractError("Executor workspace exceeds the trusted bootstrap byte limit.");
    }
    files.push({ path, content: file.content });
  }

  if (!files.some((file) => file.path === "package.json")) {
    throw new BuildExecutorContractError("Dependency lock bootstrap requires package.json.");
  }
  if (files.some((file) => file.path === "pnpm-lock.yaml")) {
    throw new BuildExecutorContractError("Dependency lock bootstrap requires pnpm-lock.yaml to be absent.");
  }
  return files;
}

export function parseTrustedBuildJobRequest(value: unknown): TrustedBuildJobRequest {
  const input = asRecord(value);
  if (!input) throw new BuildExecutorContractError("Trusted Build executor request must be an object.");

  const allowed = new Set([
    "protocolVersion", "operation", "buildProjectId", "sourceVersion",
    "stackId", "templateId", "files",
  ]);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) {
      throw new BuildExecutorContractError(`Unknown trusted Build executor field: ${key}.`);
    }
  }

  if (input.protocolVersion !== BUILD_EXECUTOR_PROTOCOL_VERSION) {
    throw new BuildExecutorContractError(`Executor protocolVersion must be ${BUILD_EXECUTOR_PROTOCOL_VERSION}.`);
  }
  if (input.operation !== "dependency-lock-bootstrap") {
    throw new BuildExecutorContractError("Trusted Build executor operation is not supported.");
  }
  if (!Number.isSafeInteger(input.sourceVersion) || Number(input.sourceVersion) < 1) {
    throw new BuildExecutorContractError("Executor sourceVersion must be a positive integer.");
  }

  return {
    protocolVersion: BUILD_EXECUTOR_PROTOCOL_VERSION,
    operation: "dependency-lock-bootstrap",
    buildProjectId: boundedId(input.buildProjectId, "buildProjectId", BUILD_EXECUTOR_LIMITS.idChars),
    sourceVersion: Number(input.sourceVersion),
    stackId: boundedId(input.stackId, "stackId", BUILD_EXECUTOR_LIMITS.stackIdChars),
    templateId: boundedId(input.templateId, "templateId", BUILD_EXECUTOR_LIMITS.templateIdChars),
    files: parseFiles(input.files),
  };
}

export type DependencyLockBootstrapExecutionResponseV1 = Readonly<{
  ok: true;
  result: Readonly<{
    protocolVersion: typeof BUILD_EXECUTOR_PROTOCOL_VERSION;
    operation: "dependency-lock-bootstrap";
    buildProjectId: string;
    sourceVersion: number;
    output: Readonly<{
      path: "pnpm-lock.yaml";
      content: string;
    }>;
  }>;
}>;
