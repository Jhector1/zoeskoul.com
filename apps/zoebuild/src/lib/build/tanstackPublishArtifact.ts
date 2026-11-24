import "server-only";
import { createHash } from "node:crypto";
import { PUBLISH_BUNDLE_BYTES_LIMIT, type BuildMediaPrivateObjectStore } from "@zoeskoul/build-application";
import type { ProductionBuildJobRequestV1, TanstackWorkerBuildExecutionResponseV1 } from "@zoeskoul/build-executor-contracts";
import { verifyTanstackWorkerBuildReceipt } from "./zoeTanstackWorkerReceipt";

// A compiled release candidate, NOT an active deployment. Only a trusted
// owner-scoped service may call this with a service-authenticated Runner response.
export type TanstackPublishArtifactReference = Readonly<{
  kind: "worker-bundle-v1";
  ownerId: string;
  buildProjectId: string;
  sourceVersion: number;
  snapshotSha256: string;
  artifactSha256: string;
  objectSha256: string;
  objectKey: string;
  artifactBytes: number;
  artifactFiles: number;
}>;
const sha = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const ID = /^[A-Za-z0-9_-]{4,128}$/;
const HEX = /^[0-9a-f]{64}$/;
function requireValid(condition: unknown): asserts condition {
  if (!condition) throw new Error("BUILD_PUBLISH_ARTIFACT_INVALID");
}
function objectKey(ref: Pick<TanstackPublishArtifactReference, "ownerId"|"buildProjectId"|"sourceVersion"|"artifactSha256"|"objectSha256">) {
  requireValid(ID.test(ref.ownerId) && ID.test(ref.buildProjectId) && Number.isSafeInteger(ref.sourceVersion) && ref.sourceVersion > 0 && HEX.test(ref.artifactSha256) && HEX.test(ref.objectSha256));
  return `published-artifacts/${ref.ownerId}/${ref.buildProjectId}/${ref.sourceVersion}/${ref.artifactSha256}/${ref.objectSha256}`;
}

/** No browser artifacts, no source changes, no deployment-ready claims. */
export async function stageTanstackPublishArtifact(input: Readonly<{
  ownerId: string;
  request: ProductionBuildJobRequestV1;
  execution: TanstackWorkerBuildExecutionResponseV1;
  store: BuildMediaPrivateObjectStore;
}>): Promise<TanstackPublishArtifactReference> {
  const {request, execution, store, ownerId} = input;
  requireValid(ID.test(ownerId) && ID.test(request.buildProjectId));
  const snapshotSha256 = sha(JSON.stringify({files:request.files,binaryFiles:request.binaryFiles ?? []}));
  requireValid(execution?.result?.snapshotSha256 === snapshotSha256);
  const receipt = verifyTanstackWorkerBuildReceipt({request, execution});
  requireValid(receipt.runtimeSmoke?.state !== "failed");
  const artifact = execution.result.artifact;
  requireValid(artifact.files.every(file => file.path.length <= 1024));
  // Explicit field projection: never persist unknown Runner properties or raw source.
  const bundle = {kind:"worker-bundle-v1",buildProjectId:request.buildProjectId,sourceVersion:request.sourceVersion,snapshotSha256,
    artifact:{type:artifact.type,serverOutputPath:artifact.serverOutputPath,assetsOutputPath:artifact.assetsOutputPath,
      entrypoint:artifact.entrypoint,sha256:artifact.sha256,totalBytes:artifact.totalBytes,
      files:artifact.files.map(file=>({path:file.path,encoding:file.encoding,data:file.data}))}};
  const bytes = Buffer.from(JSON.stringify(bundle), "utf8");
  requireValid(bytes.byteLength <= PUBLISH_BUNDLE_BYTES_LIMIT);
  const objectSha256 = sha(bytes);
  const identity = {ownerId,buildProjectId:request.buildProjectId,sourceVersion:request.sourceVersion,
    artifactSha256:receipt.artifactSha256,objectSha256};
  const key = objectKey(identity);
  await store.putIfAbsent({key,bytes,mimeType:"application/json",sha256:objectSha256});
  const readback = await store.read(key);
  requireValid(readback && readback.byteLength === bytes.byteLength && sha(readback) === objectSha256);
  return {kind:"worker-bundle-v1",...identity,snapshotSha256,objectKey:key,
    artifactBytes:receipt.artifactBytes,artifactFiles:receipt.artifactFiles};
}
