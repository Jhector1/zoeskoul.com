import { createHash } from "node:crypto";
import {
  BUILD_EXECUTOR_PROTOCOL_VERSION,
  BUILD_EXECUTOR_BINARY_LIMITS,
  TANSTACK_WORKER_ARTIFACT_LIMITS,
  type ProductionBuildJobRequestV1,
  type TanstackWorkerRuntimeSmokeV1,
} from "@zoeskoul/build-executor-contracts";

/** This validator MUST be called only on a response from the service-authenticated
 * Runner transport. A SHA-256 digest is an integrity check, not proof that an
 * arbitrary browser-provided object was compiled in an isolated Runner. */
export class TanstackWorkerReceiptError extends Error {
  readonly code = "BUILD_WORKER_RECEIPT_UNTRUSTED" as const;
  constructor(readonly stage: string = "unspecified") {
    super("The trusted Runner did not attest the requested TanStack Worker build.");
    this.name = "TanstackWorkerReceiptError";
  }
}

type RecordValue = Record<string, unknown>;
function record(value: unknown): RecordValue | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as RecordValue : null;
}
function fail(stage: string): never { throw new TanstackWorkerReceiptError(stage); }
const HEX = /^[0-9a-f]{64}$/;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function safePath(value: string): boolean {
  if (!value || value.includes("\\") || value.includes("\0") || value.startsWith("/")) return false;
  const parts = value.split("/");
  return (parts[0] === "server" || parts[0] === "client") &&
    parts.length >= 2 && parts.every(part => part && part !== "." && part !== ".." &&
      !/^\.env(?:\.|$)/i.test(part) && !/^\.dev\.vars(?:\.|$)/i.test(part));
}

/**
 * Fail-closed, exact-snapshot response validation. Never publish the included
 * files, trust a browser-provided "passed" flag, or write workspace source here.
 * Artifacts are discarded by the future edit verifier after this receipt passes.
 */
export function verifyTanstackWorkerBuildReceipt(input: Readonly<{
  request: ProductionBuildJobRequestV1;
  execution: unknown;
  inspectBinaryAssets?: boolean;
  requireRuntimeReceipt?: boolean;
}>): Readonly<{
  state: "passed";
  buildProjectId: string;
  sourceVersion: number;
  artifactSha256: string;
  artifactBytes: number;
  artifactFiles: number;
  runtimeSmoke?: TanstackWorkerRuntimeSmokeV1;
  binaryAssets?: readonly Readonly<{
    path: string; sha256: string; byteLength: number;
    clientFileMatch: boolean; clientInlineMatch: boolean;
  }>[];
}> {
  const { request } = input;
  if (request.protocolVersion !== BUILD_EXECUTOR_PROTOCOL_VERSION ||
      request.operation !== "production-build" ||
      request.stackId !== "tanstack-start-v1" ||
      request.templateId !== "tanstack-start-v1" ||
      !request.buildProjectId ||
      !Number.isSafeInteger(request.sourceVersion) || request.sourceVersion < 1) fail("request-contract");
  const envelope = record(input.execution);
  const result = record(envelope?.result);
  const artifact = record(result?.artifact);
  if (envelope?.ok !== true) fail("envelope-ok");
  if (!result) fail("result-object");
  if (result.protocolVersion !== BUILD_EXECUTOR_PROTOCOL_VERSION) fail("protocol-version");
  if (result.operation !== "production-build") fail("operation");
  if (result.buildProjectId !== request.buildProjectId) fail("project-binding");
  if (result.sourceVersion !== request.sourceVersion) fail("revision-binding");
  if (input.requireRuntimeReceipt || result.snapshotSha256 !== undefined) {
    const expected = createHash("sha256").update(JSON.stringify({files:request.files,binaryFiles:request.binaryFiles ?? []}), "utf8").digest("hex");
    if (result.snapshotSha256 !== expected) fail("snapshot-binding");
  }
  if (!artifact || artifact.type !== "worker-bundle") fail("artifact-type");
  if (artifact.serverOutputPath !== "dist/server" || artifact.assetsOutputPath !== "dist/client" ||
      artifact.entrypoint !== "index.js") fail("artifact-layout");
  if (typeof artifact.sha256 !== "string" || !HEX.test(artifact.sha256)) fail("artifact-digest-shape");
  if (!Number.isSafeInteger(artifact.totalBytes) || (artifact.totalBytes as number) <= 0 ||
      (artifact.totalBytes as number) > TANSTACK_WORKER_ARTIFACT_LIMITS.totalBytes) fail("artifact-byte-budget");
  if (!Array.isArray(artifact.files) || artifact.files.length === 0 ||
      artifact.files.length > TANSTACK_WORKER_ARTIFACT_LIMITS.files) fail("artifact-file-budget");

  // Inspect only explicitly requested saved-source image evidence. Do not require
  // every saved source asset to appear in production output (unused assets
  // may legitimately be tree-shaken). Evidence is not browser execution.
  const inspect = input.inspectBinaryAssets === true;
  const binaryInputs = inspect ? request.binaryFiles ?? [] : [];
  if (binaryInputs.length > BUILD_EXECUTOR_BINARY_LIMITS.files) fail("binary-input-count");
  let binaryTotal = 0;
  const binaryPaths = new Set<string>();
  for (const file of binaryInputs) {
    if (!Number.isSafeInteger(file.sizeBytes) || file.sizeBytes < 1 || file.sizeBytes > BUILD_EXECUTOR_BINARY_LIMITS.fileBytes ||
        typeof file.data !== "string" || file.data.length !== 4 * Math.ceil(file.sizeBytes / 3) ||
        binaryPaths.has(file.path.toLowerCase())) fail("binary-input-budget");
    binaryPaths.add(file.path.toLowerCase());
    binaryTotal += file.sizeBytes;
    if (binaryTotal > BUILD_EXECUTOR_BINARY_LIMITS.totalBytes) fail("binary-input-budget");
  }
  // Executor binary checksums are canonical sha256:<hex>; evidence exposes
  // the bare digest, consistent with artifactSha256 and file comparisons.
  const binary = binaryInputs.map(file => {
    if (typeof file.checksum !== "string" || !/^sha256:[0-9a-f]{64}$/.test(file.checksum))
      fail("binary-input-checksum-format");
    const bytes = Buffer.from(file.data, "base64");
    if (bytes.length !== file.sizeBytes || bytes.toString("base64") !== file.data ||
        `sha256:${createHash("sha256").update(bytes).digest("hex")}` !== file.checksum)
      fail("binary-input-checksum");
    return {
      path: file.path, sha256: file.checksum.slice(7), byteLength: file.sizeBytes,
      clientFileMatch: false, clientInlineMatch: false,
      uri: Buffer.from(`data:${file.mimeType};base64,${file.data}`, "ascii"),
    };
  });
  let total = 0;
  const files = artifact.files as unknown[];
  const used = new Set<string>();
  const hash = createHash("sha256");
  let serverEntry = false, wrangler = false, clientAssets = false;
  let previous: string | null = null;
  for (const item of files) {
    const file = record(item);
    if (!file || typeof file.path !== "string" || !safePath(file.path) ||
        file.encoding !== "base64" || typeof file.data !== "string" ||
        file.data.length > Math.ceil(TANSTACK_WORKER_ARTIFACT_LIMITS.fileBytes / 3) * 4 + 4 ||
        !BASE64.test(file.data) || used.has(file.path)) fail("file-shape-path-or-duplicate");
    if (previous !== null && previous.localeCompare(file.path, "en") >= 0) fail("file-order");
    previous = file.path;
    used.add(file.path);
    const bytes = Buffer.from(file.data, "base64");
    if (bytes.toString("base64") !== file.data ||
        bytes.byteLength > TANSTACK_WORKER_ARTIFACT_LIMITS.fileBytes ||
        total + bytes.byteLength > TANSTACK_WORKER_ARTIFACT_LIMITS.totalBytes) fail("file-bytes-or-base64");
    total += bytes.byteLength;
    if (file.path.startsWith("client/")) {
      const clientDigest = binary.some(asset => bytes.byteLength === asset.byteLength) ? createHash("sha256").update(bytes).digest("hex") : null;
      for (const asset of binary) {
        if (bytes.byteLength === asset.byteLength && clientDigest === asset.sha256)
          asset.clientFileMatch = true;
        if (/\.(?:m?js|css|html)$/i.test(file.path) && bytes.includes(asset.uri))
          asset.clientInlineMatch = true;
      }
    }
    hash.update(file.path, "utf8");
    hash.update("\0");
    hash.update(bytes);
    hash.update("\0");
    if (file.path === "server/index.js" && bytes.length) serverEntry = true;
    if (file.path === "server/wrangler.json") {
      try { if (!record(JSON.parse(bytes.toString("utf8")))) fail("wrangler-metadata"); }
      catch { fail("wrangler-metadata"); }
      wrangler = true;
    }
    if (file.path.startsWith("client/") && bytes.length) clientAssets = true;
  }
  if (!serverEntry) fail("server-entry");
  if (!wrangler) fail("wrangler-missing");
  if (!clientAssets) fail("client-assets");
  if (total !== artifact.totalBytes) fail("total-bytes");
  if (hash.digest("hex") !== artifact.sha256) fail("artifact-digest");
  if (input.requireRuntimeReceipt && result.runtimeSmoke === undefined) fail("runtime-evidence-missing");
  let runtimeSmoke: TanstackWorkerRuntimeSmokeV1 | undefined;
  if (result.runtimeSmoke !== undefined) {
    const smoke=record(result.runtimeSmoke);
    if (!smoke || smoke.artifactSha256 !== artifact.sha256) fail("runtime-artifact-binding");
    if (smoke.state==="passed" && Object.keys(smoke).sort().join(",")==="artifactSha256,healthStatus,homeStatus,state,verifiedClientAssets" &&
        smoke.homeStatus===200 && smoke.healthStatus===200 && smoke.verifiedClientAssets===2) {
      runtimeSmoke={state:"passed",artifactSha256:artifact.sha256,homeStatus:200,healthStatus:200,verifiedClientAssets:2};
    } else if (smoke.state==="failed" && Object.keys(smoke).sort().join(",")==="artifactSha256,stage,state" &&
      (smoke.stage==="configuration" || smoke.stage==="startup" || smoke.stage==="ssr" || smoke.stage==="health" || smoke.stage==="client-assets")) {
      runtimeSmoke={state:"failed",artifactSha256:artifact.sha256,stage:smoke.stage};
    } else fail("runtime-evidence-shape");
  }
  return {state: "passed", buildProjectId: request.buildProjectId,
    sourceVersion: request.sourceVersion, artifactSha256: artifact.sha256,
    artifactBytes: total, artifactFiles: files.length,
    ...(runtimeSmoke ? {runtimeSmoke} : {}),
    ...(inspect ? {binaryAssets: binary.map(({uri: _uri, ...evidence}) => evidence)} : {})};
}
