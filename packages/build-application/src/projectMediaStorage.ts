/**
 * ZoeBuild AI4B1 — authenticated, immutable project media storage orchestration.
 *
 * No database, S3 SDK, R2 credentials, public URL or application classification
 * lives here. Trusted server adapters implement the ownership reader, private
 * object store and atomic metadata repository. Nothing here makes storage public.
 */
import {
  BUILD_MEDIA_LIMITS,
  buildMediaObjectKey,
  parseBuildMediaAsset,
  parseBuildMediaScope,
  type BuildMediaAsset,
  type BuildMediaProjectScope,
} from "@zoeskoul/build-contracts";

export class BuildMediaStorageError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "BuildMediaStorageError";
  }
}

/** Must look up the current, non-archived CodeProject owner via BuildProject. */
export interface BuildMediaOwnershipReader {
  getActiveProjectOwnerId(buildProjectId: string): Promise<string | null>;
}

/**
 * Must implement conditional immutable create and private reads. Never overwrite.
 * "already-exists" is not proof of identical bytes; the service checks its digest.
 */
export interface BuildMediaPrivateObjectStore {
  putIfAbsent(input: Readonly<{
    key: string;
    bytes: Uint8Array;
    mimeType: string;
    sha256: string;
  }>): Promise<"created" | "already-exists">;
  read(key: string): Promise<Uint8Array | null>;
}

/** Database adapters MUST implement idempotent atomic insert or return existing. */
export interface BuildMediaMetadataRepository {
  find(scope: BuildMediaProjectScope, assetId: string): Promise<BuildMediaAsset | null>;
  insertIfAbsent(asset: BuildMediaAsset): Promise<BuildMediaAsset>;
}

/** The server's actual image decoder, not AI-produced metadata. */
export interface BuildMediaImageInspector {
  inspect(bytes: Uint8Array): Promise<Readonly<{
    mimeType: string;
    width: number;
    height: number;
  }>>;
}

/** Never derive ownerId from a request field or generated code. */
export async function authorizeBuildMediaOwner(input: Readonly<{
  actorUserId: string;
  buildProjectId: string;
  ownership: BuildMediaOwnershipReader;
}>): Promise<BuildMediaProjectScope> {
  let proposed: BuildMediaProjectScope;
  try {
    proposed = parseBuildMediaScope({
      ownerId: input.actorUserId,
      buildProjectId: input.buildProjectId,
    });
  } catch {
    throw new BuildMediaStorageError("BUILD_MEDIA_ACCESS_DENIED");
  }
  const actualOwner = await input.ownership.getActiveProjectOwnerId(proposed.buildProjectId);
  if (actualOwner !== proposed.ownerId) {
    // Deliberately identical for absent, archived and someone else's project.
    throw new BuildMediaStorageError("BUILD_MEDIA_ACCESS_DENIED");
  }
  return proposed;
}

/** Tiny magic-header guard; actual dimensions and format come from a real decoder. */
export function assertBuildMediaImageSignature(bytes: Uint8Array, mimeType: string): void {
  const b = bytes;
  const match = (offset: number, values: readonly number[]) =>
    values.every((x, i) => b[offset + i] === x);
  let valid = false;
  if (mimeType === "image/png") {
    valid = b.length >= 24 && match(0, [137, 80, 78, 71, 13, 10, 26, 10]);
  } else if (mimeType === "image/jpeg") {
    valid = b.length >= 4 && match(0, [255, 216, 255]);
  } else if (mimeType === "image/webp") {
    valid = b.length >= 16 && match(0, [82, 73, 70, 70]) && match(8, [87, 69, 66, 80]);
  } else if (mimeType === "image/avif") {
    valid = b.length >= 16 && match(4, [102, 116, 121, 112]) &&
      (match(8, [97, 118, 105, 102]) || match(8, [97, 118, 105, 115]));
  }
  if (!valid) throw new BuildMediaStorageError("BUILD_MEDIA_SIGNATURE_INVALID");
}

async function sha256(bytes: Uint8Array): Promise<string> {
  // Copy before hashing: Buffer/pooled arrays may have a larger shared backing.
  const copy = Uint8Array.from(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy.buffer);
  return Array.from(new Uint8Array(digest), x => x.toString(16).padStart(2, "0")).join("");
}

function requireSameAsset(expected: BuildMediaAsset, actual: BuildMediaAsset): void {
  const identity: readonly (keyof BuildMediaAsset)[] = [
    "id", "objectKey", "sha256", "mimeType", "byteLength", "kind",
    "origin", "visibility", "width", "height", "durationMs", "altText",
    "providerId", "modelId", "state",
  ];
  if (identity.some(key => expected[key] !== actual[key])) {
    throw new BuildMediaStorageError("BUILD_MEDIA_IMMUTABLE_CONFLICT");
  }
}

/**
 * Store a private image only after caller authentication, real decoding and SHA.
 * `assetId` is generated server-side and metadata comes from trusted provider
 * completion or authenticated upload processing, never directly from model text.
 * A failure after object upload may leave an orphan: safe GC is a later wave.
 */
export async function ingestPrivateBuildMediaImage(input: Readonly<{
  actorUserId: string;
  buildProjectId: string;
  ownership: BuildMediaOwnershipReader;
  assetId: string;
  origin: "generated" | "uploaded";
  providerId: string | null;
  modelId: string | null;
  bytes: Uint8Array;
  altText: string | null;
  inspector: BuildMediaImageInspector;
  store: BuildMediaPrivateObjectStore;
  catalog: BuildMediaMetadataRepository;
}>): Promise<BuildMediaAsset> {
  const scope = await authorizeBuildMediaOwner({
    actorUserId: input.actorUserId, buildProjectId: input.buildProjectId,
    ownership: input.ownership,
  });
  if (!(input.bytes instanceof Uint8Array) ||
      input.bytes.byteLength === 0 || input.bytes.byteLength > BUILD_MEDIA_LIMITS.imageBytes) {
    throw new BuildMediaStorageError("BUILD_MEDIA_SIZE_INVALID");
  }
  // Independent copy so caller cannot mutate content across asynchronous steps.
  const bytes = Uint8Array.from(input.bytes);
  const decoded = await input.inspector.inspect(bytes);
  assertBuildMediaImageSignature(bytes, decoded.mimeType);
  const digest = await sha256(bytes);
  const asset = parseBuildMediaAsset({
    id: input.assetId, scope, kind: "image", origin: input.origin,
    visibility: "private", state: "ready", sha256: digest,
    objectKey: buildMediaObjectKey(scope, input.assetId, digest),
    mimeType: decoded.mimeType, byteLength: bytes.byteLength,
    width: decoded.width, height: decoded.height, durationMs: null,
    altText: input.altText, providerId: input.providerId, modelId: input.modelId,
  }, scope);
  const prior = await input.catalog.find(scope, asset.id);
  if (prior) {
    const safePrior = parseBuildMediaAsset(prior, scope);
    requireSameAsset(asset, safePrior);
    const stored = await input.store.read(safePrior.objectKey);
    if (!stored || stored.byteLength !== bytes.byteLength || await sha256(stored) !== asset.sha256) {
      throw new BuildMediaStorageError("BUILD_MEDIA_OBJECT_INTEGRITY_FAILURE");
    }
    return safePrior;
  }
  const result = await input.store.putIfAbsent({
    key: asset.objectKey, bytes, mimeType: asset.mimeType, sha256: asset.sha256,
  });
  if (result !== "created" && result !== "already-exists") {
    throw new BuildMediaStorageError("BUILD_MEDIA_STORE_RESULT_INVALID");
  }
  if (result === "already-exists") {
    const existing = await input.store.read(asset.objectKey);
    if (!existing || existing.length !== bytes.length || await sha256(existing) !== asset.sha256) {
      throw new BuildMediaStorageError("BUILD_MEDIA_OBJECT_COLLISION");
    }
  }
  const committed = parseBuildMediaAsset(await input.catalog.insertIfAbsent(asset), scope);
  requireSameAsset(asset, committed);
  return committed;
}

/** Never resolve private handles into public URLs or expose them without scope. */
export async function readPrivateBuildMediaImage(input: Readonly<{
  actorUserId: string;
  buildProjectId: string;
  ownership: BuildMediaOwnershipReader;
  assetId: string;
  catalog: BuildMediaMetadataRepository;
  store: BuildMediaPrivateObjectStore;
}>): Promise<Readonly<{ asset: BuildMediaAsset; bytes: Uint8Array }> | null> {
  const scope = await authorizeBuildMediaOwner({
    actorUserId: input.actorUserId, buildProjectId: input.buildProjectId,
    ownership: input.ownership,
  });
  // Validate ID even if database adapter would otherwise ignore it.
  const keyProbe = buildMediaObjectKey(scope, input.assetId, "0".repeat(64));
  void keyProbe;
  const row = await input.catalog.find(scope, input.assetId);
  if (!row) return null;
  const asset = parseBuildMediaAsset(row, scope);
  if (asset.kind !== "image" || asset.visibility !== "private") {
    throw new BuildMediaStorageError("BUILD_MEDIA_PRIVATE_IMAGE_REQUIRED");
  }
  const bytes = await input.store.read(asset.objectKey);
  if (!bytes || bytes.byteLength !== asset.byteLength || await sha256(bytes) !== asset.sha256) {
    throw new BuildMediaStorageError("BUILD_MEDIA_OBJECT_INTEGRITY_FAILURE");
  }
  assertBuildMediaImageSignature(bytes, asset.mimeType);
  return { asset, bytes: Uint8Array.from(bytes) };
}
