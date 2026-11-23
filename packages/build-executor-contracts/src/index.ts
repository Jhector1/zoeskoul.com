export const BUILD_EXECUTOR_PROTOCOL_VERSION = 1 as const;
/** Express and browser-facing trusted-build JSON limit. Keep both boundaries
 * identical so ZoeBuild never admits a body the Runner must reject. */
export const BUILD_EXECUTOR_HTTP_BODY_LIMIT_BYTES = 8 * 1024 * 1024;

/** Internal Runner → ZoeBuild control-plane signal: never treat a TanStack
 * source replacement as an in-place React/Vite workspace sync. */
export const TANSTACK_PREVIEW_RESTART_REQUIRED = "TANSTACK_PREVIEW_RESTART_REQUIRED" as const;

export const TRUSTED_BUILD_OPERATIONS = [
  "dependency-lock-bootstrap",
  "production-build",
] as const;
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
/** Hydrated, server-verified image bytes. No object keys, URLs, or upload grants
 * cross the Runner API; the exact bytes are bounded again on the Runner. */
export type BuildExecutorBinaryFile = Readonly<{
  path: string;
  encoding: "base64";
  data: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp" | "image/avif";
  sizeBytes: number;
  checksum: string;
}>;
export const BUILD_EXECUTOR_BINARY_LIMITS = {
  files: 150,
  fileBytes: 5 * 1024 * 1024,
  totalBytes: 5 * 1024 * 1024,
  // Express and ZoeBuild share an 8 MiB trusted JSON boundary. Leave space
  // for protocol metadata and possible escape overhead in source strings.
  jsonBytes: BUILD_EXECUTOR_HTTP_BODY_LIMIT_BYTES - 4096,
} as const;

export type DependencyLockBootstrapJobRequestV1 = Readonly<{
  protocolVersion: typeof BUILD_EXECUTOR_PROTOCOL_VERSION;
  operation: "dependency-lock-bootstrap";
  buildProjectId: string;
  sourceVersion: number;
  stackId: string;
  templateId: string;
  files: readonly BuildExecutorTextFile[];
}>;

export type ProductionBuildJobRequestV1 = Readonly<{
  protocolVersion: typeof BUILD_EXECUTOR_PROTOCOL_VERSION;
  operation: "production-build";
  buildProjectId: string;
  sourceVersion: number;
  stackId: string;
  templateId: string;
  files: readonly BuildExecutorTextFile[];
  binaryFiles?: readonly BuildExecutorBinaryFile[];
}>;

export type TrustedBuildJobRequest =
  | DependencyLockBootstrapJobRequestV1
  | ProductionBuildJobRequestV1;

export const PRODUCTION_BUILD_ARTIFACT_LIMITS = {
  files: 300,
  fileBytes: 2 * 1024 * 1024,
  totalBytes: 4 * 1024 * 1024,
} as const;

export type ProductionBuildArtifactFileV1 = Readonly<{
  path: string;
  encoding: "base64";
  data: string;
}>;

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

function parseFiles(
  value: unknown,
  operation: TrustedBuildOperation,
): BuildExecutorTextFile[] {
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
    throw new BuildExecutorContractError(
      "Trusted Build execution requires package.json.",
    );
  }

  const lockfile = files.find(
    (file) => file.path === "pnpm-lock.yaml",
  );

  if (
    operation === "dependency-lock-bootstrap" &&
    lockfile
  ) {
    throw new BuildExecutorContractError(
      "Dependency lock bootstrap requires pnpm-lock.yaml to be absent.",
    );
  }

  if (
    operation === "production-build" &&
    (!lockfile || !lockfile.content.trim())
  ) {
    throw new BuildExecutorContractError(
      "Production build requires a non-empty pnpm-lock.yaml.",
    );
  }

  return files;
}

const IMAGE_MIME_BY_EXTENSION: Readonly<Record<string, BuildExecutorBinaryFile["mimeType"]>> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".avif": "image/avif",
};
const BASE64_IMAGE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function parseBinaryFiles(value: unknown, text: readonly BuildExecutorTextFile[]): BuildExecutorBinaryFile[] {
  if (!Array.isArray(value) || value.length > BUILD_EXECUTOR_BINARY_LIMITS.files ||
      text.length + value.length > BUILD_EXECUTOR_LIMITS.files) {
    throw new BuildExecutorContractError("Invalid trusted binary file count.");
  }
  const seen = new Set(text.map(file => file.path.toLocaleLowerCase("en-US")));
  const result: BuildExecutorBinaryFile[] = [];
  let total = 0;
  for (const raw of value) {
    const file = asRecord(raw);
    if (!file || Object.keys(file).some(key => ![
      "path", "encoding", "data", "mimeType", "sizeBytes", "checksum",
    ].includes(key))) throw new BuildExecutorContractError("Invalid trusted binary file fields.");
    const name = safeRelativePath(file.path);
    const key = name.toLocaleLowerCase("en-US");
    if (seen.has(key)) throw new BuildExecutorContractError("Duplicate trusted file path.");
    seen.add(key);
    const extension = /\.[^.\/]+$/.exec(name)?.[0]?.toLowerCase();
    const allowedMime = extension && IMAGE_MIME_BY_EXTENSION[extension];
    if (!allowedMime || file.mimeType !== allowedMime || file.encoding !== "base64" ||
        typeof file.data !== "string" || typeof file.checksum !== "string" ||
        !/^sha256:[a-f0-9]{64}$/.test(file.checksum) ||
        !Number.isSafeInteger(file.sizeBytes) || Number(file.sizeBytes) < 1 ||
        Number(file.sizeBytes) > BUILD_EXECUTOR_BINARY_LIMITS.fileBytes) {
      throw new BuildExecutorContractError("Invalid trusted image metadata.");
    }
    // Length first: this must not run a regexp over an unbounded string.
    const size = Number(file.sizeBytes);
    const encodedLength = 4 * Math.ceil(size / 3);
    if (file.data.length !== encodedLength || !BASE64_IMAGE.test(file.data)) {
      throw new BuildExecutorContractError("Invalid trusted image base64.");
    }
    const padding = file.data.endsWith("==") ? 2 : file.data.endsWith("=") ? 1 : 0;
    if ((encodedLength / 4) * 3 - padding !== size) {
      throw new BuildExecutorContractError("Invalid trusted image length.");
    }
    total += size;
    if (total > BUILD_EXECUTOR_BINARY_LIMITS.totalBytes) {
      throw new BuildExecutorContractError("Trusted images exceed total byte limit.");
    }
    result.push({path:name,encoding:"base64",data:file.data,
      mimeType:allowedMime,sizeBytes:size,checksum:file.checksum});
  }
  return result;
}

export function parseTrustedBuildJobRequest(value: unknown): TrustedBuildJobRequest {
  const input = asRecord(value);
  if (!input) throw new BuildExecutorContractError("Trusted Build executor request must be an object.");

  const allowed = new Set([
    "protocolVersion", "operation", "buildProjectId", "sourceVersion",
    "stackId", "templateId", "files", "binaryFiles",
  ]);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) {
      throw new BuildExecutorContractError(`Unknown trusted Build executor field: ${key}.`);
    }
  }

  if (input.protocolVersion !== BUILD_EXECUTOR_PROTOCOL_VERSION) {
    throw new BuildExecutorContractError(`Executor protocolVersion must be ${BUILD_EXECUTOR_PROTOCOL_VERSION}.`);
  }
  if (
    input.operation !== "dependency-lock-bootstrap" &&
    input.operation !== "production-build"
  ) {
    throw new BuildExecutorContractError(
      "Trusted Build executor operation is not supported.",
    );
  }

  if (
    !Number.isSafeInteger(input.sourceVersion) ||
    Number(input.sourceVersion) < 1
  ) {
    throw new BuildExecutorContractError(
      "Executor sourceVersion must be a positive integer.",
    );
  }

  const operation = input.operation;
  const common = {
    protocolVersion: BUILD_EXECUTOR_PROTOCOL_VERSION,
    buildProjectId: boundedId(
      input.buildProjectId,
      "buildProjectId",
      BUILD_EXECUTOR_LIMITS.idChars,
    ),
    sourceVersion: Number(input.sourceVersion),
    stackId: boundedId(
      input.stackId,
      "stackId",
      BUILD_EXECUTOR_LIMITS.stackIdChars,
    ),
    templateId: boundedId(
      input.templateId,
      "templateId",
      BUILD_EXECUTOR_LIMITS.templateIdChars,
    ),
    files: parseFiles(
      input.files,
      operation,
    ),
  };

  if (operation === "dependency-lock-bootstrap") {
    if (Object.prototype.hasOwnProperty.call(input, "binaryFiles")) {
      throw new BuildExecutorContractError("Dependency bootstrap cannot transport image bytes.");
    }
    return {...common, operation};
  }
  const binaryFiles = input.binaryFiles === undefined
    ? undefined : parseBinaryFiles(input.binaryFiles, common.files);
  if (binaryFiles?.length && (input.stackId !== "tanstack-start-v1" ||
      input.templateId !== "tanstack-start-v1")) {
    throw new BuildExecutorContractError("Trusted image transport is TanStack-only.");
  }
  if (binaryFiles !== undefined && utf8ByteLength(JSON.stringify({
    ...common, operation, binaryFiles,
  })) > BUILD_EXECUTOR_BINARY_LIMITS.jsonBytes) {
    throw new BuildExecutorContractError("Trusted image request exceeds transport limit.");
  }
  return {
    ...common,
    operation: "production-build",
    ...(binaryFiles === undefined ? {} : {binaryFiles}),
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


export type ProductionBuildExecutionResponseV1 = Readonly<{
  ok: true;
  result: Readonly<{
    protocolVersion: typeof BUILD_EXECUTOR_PROTOCOL_VERSION;
    operation: "production-build";
    buildProjectId: string;
    sourceVersion: number;
    artifact: Readonly<{
      type: "static-directory";
      outputPath: "dist";
      totalBytes: number;
      sha256: string;
      files: readonly ProductionBuildArtifactFileV1[];
    }>;
  }>;
}>;

/** Canonical isolated TanStack Worker output limits, shared by Runner and control plane.
 * Worker bundles are executable server and client outputs, never static-directory artifacts. */
export const TANSTACK_WORKER_ARTIFACT_LIMITS = {
  files: 1000,
  fileBytes: 12 * 1024 * 1024,
  totalBytes: 32 * 1024 * 1024,
} as const;

export type TanstackWorkerArtifactV1 = Readonly<{
  type: "worker-bundle";
  serverOutputPath: "dist/server";
  assetsOutputPath: "dist/client";
  entrypoint: "index.js";
  sha256: string;
  totalBytes: number;
  files: readonly Readonly<{
    path: string;
    encoding: "base64";
    data: string;
  }>[];
}>;

/** HTTP-only smoke evidence, independent of browser hydration or publishing. */
export type TanstackWorkerRuntimeSmokeV1 = Readonly<{
  state:"passed"; artifactSha256:string; homeStatus:200; healthStatus:200; verifiedClientAssets:2;
}> | Readonly<{
  state:"failed"; artifactSha256:string;
  stage:"configuration"|"startup"|"ssr"|"health"|"client-assets";
}>;

/** Trusted Runner transport response; publication and save are separate operations. */
export type TanstackWorkerBuildExecutionResponseV1 = Readonly<{
  ok: true;
  result: Readonly<{
    protocolVersion: typeof BUILD_EXECUTOR_PROTOCOL_VERSION;
    operation: "production-build";
    buildProjectId: string;
    sourceVersion: number;
    snapshotSha256?: string;
    artifact: TanstackWorkerArtifactV1;
    runtimeSmoke?: TanstackWorkerRuntimeSmokeV1;
  }>;
}>;

export { classifyTanstackPreviewTransition, isTanstackLiveSourcePath, isTanstackLiveBinaryPath } from "./tanstackLivePreviewTransition";
export type { TanstackPreviewTransition, TanstackPreviewLeaseMode, TanstackPreviewTransitionReason } from "./tanstackLivePreviewTransition";
