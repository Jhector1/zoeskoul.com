import { createHash } from "node:crypto";
import {
  BUILD_EXECUTOR_PROTOCOL_VERSION,
  TANSTACK_WORKER_ARTIFACT_LIMITS,
  type ProductionBuildJobRequestV1,
} from "@zoeskoul/build-executor-contracts";

/** This validator MUST be called only on a response from the service-authenticated
 * Runner transport. A SHA-256 digest is an integrity check, not proof that an
 * arbitrary browser-provided object was compiled in an isolated Runner. */
export class TanstackWorkerReceiptError extends Error {
  readonly code = "BUILD_WORKER_RECEIPT_UNTRUSTED" as const;
  constructor() {
    super("The trusted Runner did not attest the requested TanStack Worker build.");
    this.name = "TanstackWorkerReceiptError";
  }
}

type RecordValue = Record<string, unknown>;
function record(value: unknown): RecordValue | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as RecordValue : null;
}
function fail(): never { throw new TanstackWorkerReceiptError(); }
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
}>): Readonly<{
  state: "passed";
  buildProjectId: string;
  sourceVersion: number;
  artifactSha256: string;
  artifactBytes: number;
  artifactFiles: number;
}> {
  const { request } = input;
  if (request.protocolVersion !== BUILD_EXECUTOR_PROTOCOL_VERSION ||
      request.operation !== "production-build" ||
      request.stackId !== "tanstack-start-v1" ||
      request.templateId !== "tanstack-start-v1" ||
      !request.buildProjectId ||
      !Number.isSafeInteger(request.sourceVersion) || request.sourceVersion < 1) fail();
  const envelope = record(input.execution);
  const result = record(envelope?.result);
  const artifact = record(result?.artifact);
  if (envelope?.ok !== true || result?.protocolVersion !== BUILD_EXECUTOR_PROTOCOL_VERSION ||
      result?.operation !== "production-build" ||
      result?.buildProjectId !== request.buildProjectId ||
      result?.sourceVersion !== request.sourceVersion ||
      artifact?.type !== "worker-bundle" ||
      artifact?.serverOutputPath !== "dist/server" ||
      artifact?.assetsOutputPath !== "dist/client" ||
      artifact?.entrypoint !== "index.js" ||
      typeof artifact?.sha256 !== "string" || !HEX.test(artifact.sha256) ||
      !Number.isSafeInteger(artifact?.totalBytes) ||
      (artifact.totalBytes as number) <= 0 ||
      (artifact.totalBytes as number) > TANSTACK_WORKER_ARTIFACT_LIMITS.totalBytes ||
      !Array.isArray(artifact?.files) || artifact.files.length === 0 ||
      artifact.files.length > TANSTACK_WORKER_ARTIFACT_LIMITS.files) fail();

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
        !BASE64.test(file.data) || used.has(file.path)) fail();
    if (previous !== null && previous.localeCompare(file.path, "en") >= 0) fail();
    previous = file.path;
    used.add(file.path);
    const bytes = Buffer.from(file.data, "base64");
    if (bytes.toString("base64") !== file.data ||
        bytes.byteLength > TANSTACK_WORKER_ARTIFACT_LIMITS.fileBytes ||
        total + bytes.byteLength > TANSTACK_WORKER_ARTIFACT_LIMITS.totalBytes) fail();
    total += bytes.byteLength;
    hash.update(file.path, "utf8");
    hash.update("\0");
    hash.update(bytes);
    hash.update("\0");
    if (file.path === "server/index.js" && bytes.length) serverEntry = true;
    if (file.path === "server/wrangler.json") {
      try { if (!record(JSON.parse(bytes.toString("utf8")))) fail(); }
      catch { fail(); }
      wrangler = true;
    }
    if (file.path.startsWith("client/") && bytes.length) clientAssets = true;
  }
  if (!serverEntry || !wrangler || !clientAssets || total !== artifact.totalBytes ||
      hash.digest("hex") !== artifact.sha256) fail();
  return {state: "passed", buildProjectId: request.buildProjectId,
    sourceVersion: request.sourceVersion, artifactSha256: artifact.sha256,
    artifactBytes: total, artifactFiles: files.length};
}
