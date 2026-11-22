/**
 * AI4B4E1: ZoeBuild-only managed binary revision contract.
 *
 * A detached, server-side revision manifest; NOT yet a workspace serialization
 * format. Source saves, preview, publishing, FullIDE, or R2 object transport do
 * not call this module until the subsequent integration wave is accepted.
 *
 * R2 object keys and ownership fields stay server-side. Never expose these
 * bindings directly to generated application source or browser clients.
 */

export class ManagedBinaryRevisionError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "ManagedBinaryRevisionError";
  }
}

export type ManagedBinaryScope = Readonly<{
  ownerId: string;
  buildProjectId: string;
}>;

/** Metadata from a trusted, committed private R2 catalog read, NOT request JSON. */
export type ServerVerifiedBinaryAsset = Readonly<{
  ownerId: string;
  buildProjectId: string;
  assetId: string;
  objectKey: string;
  sha256: string;
  mimeType: string;
  byteLength: number;
}>;

export type ManagedBinaryBinding = ServerVerifiedBinaryAsset & Readonly<{
  nodeId: string;
  path: string;
}>;

export type ManagedBinaryRevision = ManagedBinaryScope & Readonly<{
  sourceVersion: number;
  bindings: readonly ManagedBinaryBinding[];
}>;

export type ManagedBinaryRevisionFile = Readonly<{
  nodeId: string;
  path: string;
  /** Existing managed asset ID, or newly uploaded and catalog-verified asset ID. */
  assetId: string;
}>;

const ID = /^[A-Za-z0-9_-]{4,128}$/;
const ASSET_ID = /^[A-Za-z0-9_-]{10,128}$/;
const DIGEST = /^[0-9a-f]{64}$/;
const IMAGE_BYTES_MAX = 20 * 1024 * 1024;
const SUPPORTED_MIME_BY_EXT: Readonly<Record<string, string>> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  avif: "image/avif",
};
const DENIED_SEGMENTS = new Set([".git", ".ssh", ".env", "node_modules"]);

function fail(code: string): never {
  throw new ManagedBinaryRevisionError(code);
}

function assertScope(scope: ManagedBinaryScope): void {
  if (!ID.test(scope.ownerId) || !ID.test(scope.buildProjectId)) {
    fail("MANAGED_BINARY_SCOPE_INVALID");
  }
}

function assertSourceVersion(version: number): void {
  if (!Number.isSafeInteger(version) || version < 1) {
    fail("MANAGED_BINARY_SOURCE_VERSION_INVALID");
  }
}

export function validateManagedBinaryPath(path: string, mimeType: string): string {
  if (typeof path !== "string" || !path || path.length > 1024 ||
      path.startsWith("/") || path.includes("\\") || path.includes("\0") ||
      /^[a-zA-Z]:/.test(path) || path.includes("//")) {
    return fail("MANAGED_BINARY_PATH_INVALID");
  }
  const segments = path.split("/");
  if (segments.length > 24 || segments.some(segment =>
      !segment || segment === "." || segment === ".." ||
      segment.trim() !== segment || DENIED_SEGMENTS.has(segment.toLowerCase()) ||
      segment.toLowerCase().startsWith(".env.") || /[\x00-\x1f]/.test(segment))) {
    return fail("MANAGED_BINARY_PATH_INVALID");
  }
  const ext = segments.at(-1)!.split(".").at(-1)!.toLowerCase();
  if (SUPPORTED_MIME_BY_EXT[ext] !== mimeType) {
    return fail("MANAGED_BINARY_MIME_PATH_MISMATCH");
  }
  return path;
}

/** R2 currently supports 4 image types. Additional binaries require a new store contract. */
export function validateServerVerifiedBinaryAsset(
  asset: ServerVerifiedBinaryAsset,
  trusted: ManagedBinaryScope,
): ServerVerifiedBinaryAsset {
  assertScope(trusted);
  if (asset.ownerId !== trusted.ownerId ||
      asset.buildProjectId !== trusted.buildProjectId) {
    fail("MANAGED_BINARY_SCOPE_MISMATCH");
  }
  if (!ASSET_ID.test(asset.assetId) || !DIGEST.test(asset.sha256)) {
    fail("MANAGED_BINARY_IDENTITY_INVALID");
  }
  if (!Number.isSafeInteger(asset.byteLength) ||
      asset.byteLength <= 0 || asset.byteLength > IMAGE_BYTES_MAX ||
      !Object.values(SUPPORTED_MIME_BY_EXT).includes(asset.mimeType)) {
    fail("MANAGED_BINARY_METADATA_INVALID");
  }
  const expectedKey = `project-media/${trusted.ownerId}/${trusted.buildProjectId}/${asset.assetId}/${asset.sha256}`;
  if (asset.objectKey !== expectedKey) {
    fail("MANAGED_BINARY_OBJECT_KEY_MISMATCH");
  }
  return { ...asset };
}

/** Check that an immutable manifest belongs to the requested revision and project. */
export function validateManagedBinaryRevision(
  revision: ManagedBinaryRevision,
  scope: ManagedBinaryScope,
  expectedVersion: number,
): ManagedBinaryRevision {
  assertScope(scope);
  assertSourceVersion(expectedVersion);
  if (revision.ownerId !== scope.ownerId ||
      revision.buildProjectId !== scope.buildProjectId ||
      revision.sourceVersion !== expectedVersion ||
      !Array.isArray(revision.bindings) || revision.bindings.length > 150) {
    fail("MANAGED_BINARY_REVISION_MISMATCH");
  }
  const paths = new Set<string>();
  const nodes = new Set<string>();
  const bindings = revision.bindings.map(binding => {
    if (!binding || typeof binding.nodeId !== "string" ||
        !ID.test(binding.nodeId)) fail("MANAGED_BINARY_NODE_INVALID");
    const verified = validateServerVerifiedBinaryAsset(binding, scope);
    const path = validateManagedBinaryPath(binding.path, verified.mimeType);
    const folded = path.toLocaleLowerCase("en-US");
    if (paths.has(folded) || nodes.has(binding.nodeId)) {
      fail("MANAGED_BINARY_DUPLICATE_BINDING");
    }
    paths.add(folded);
    nodes.add(binding.nodeId);
    return { ...verified, nodeId: binding.nodeId, path };
  });
  return { ...scope, sourceVersion: expectedVersion, bindings };
}

/**
 * Build a proposed NEW revision from the prior pinned revision, with only
 * catalog-verified new assets. This does not commit a DB revision or write R2.
 *
 * - Rename/move: keep assetId and nodeId, change path in the new revision.
 * - Delete: omit that node from files; prior revision retains its binding.
 * - Replace: give the same node a newly staged assetId.
 * - A caller cannot introduce an unverified/new arbitrary asset reference.
 * - A caller MUST still perform saved-source compare-and-swap transactionally.
 */
export function planNextManagedBinaryRevision(input: Readonly<{
  scope: ManagedBinaryScope;
  previous: ManagedBinaryRevision;
  baseVersion: number;
  nextVersion: number;
  files: readonly ManagedBinaryRevisionFile[];
  newlyStored: readonly ServerVerifiedBinaryAsset[];
}>): ManagedBinaryRevision {
  const { scope, files } = input;
  assertSourceVersion(input.baseVersion);
  assertSourceVersion(input.nextVersion);
  if (input.nextVersion !== input.baseVersion + 1 ||
      !Array.isArray(files) || files.length > 150 ||
      !Array.isArray(input.newlyStored) || input.newlyStored.length > 150) {
    fail("MANAGED_BINARY_REVISION_SEQUENCE_INVALID");
  }
  const previous = validateManagedBinaryRevision(input.previous, scope, input.baseVersion);
  const previousByNode = new Map(previous.bindings.map(item => [item.nodeId, item]));
  const stored = new Map<string, ServerVerifiedBinaryAsset>();
  for (const value of input.newlyStored) {
    const asset = validateServerVerifiedBinaryAsset(value, scope);
    if (stored.has(asset.assetId)) fail("MANAGED_BINARY_STAGED_DUPLICATE");
    stored.set(asset.assetId, asset);
  }
  const consumed = new Set<string>();
  const bindings: ManagedBinaryBinding[] = files.map(file => {
    if (!file || typeof file.nodeId !== "string" || !ID.test(file.nodeId)) {
      fail("MANAGED_BINARY_NODE_INVALID");
    }
    const old = previousByNode.get(file.nodeId);
    const retained = old && old.assetId === file.assetId ? old : null;
    const staged = stored.get(file.assetId);
    if (!retained && !staged) fail("MANAGED_BINARY_ASSET_NOT_VERIFIED");
    if (staged) consumed.add(staged.assetId);
    const asset = retained ?? staged!;
    const path = validateManagedBinaryPath(file.path, asset.mimeType);
    return { ...asset, nodeId: file.nodeId, path };
  });
  // Incomplete uploads are not silently promoted to a committed revision.
  if (consumed.size !== stored.size) fail("MANAGED_BINARY_UNUSED_STAGED_ASSET");
  return validateManagedBinaryRevision({ ...scope, sourceVersion: input.nextVersion, bindings },
    scope, input.nextVersion);
}

/**
 * Intended for service-side hydration BEFORE FullIDE, runner, or publisher
 * consumes the workspace. Fail closed if R2 lost data or bytes were tampered.
 */
export async function readVerifiedManagedBinary(
  input: Readonly<{
    scope: ManagedBinaryScope;
    revision: ManagedBinaryRevision;
    sourceVersion: number;
    nodeId: string;
    readObject: (key: string) => Promise<Uint8Array | null>;
  }>,
): Promise<Uint8Array> {
  const revision = validateManagedBinaryRevision(input.revision, input.scope, input.sourceVersion);
  const binding = revision.bindings.find(item => item.nodeId === input.nodeId);
  if (!binding) return fail("MANAGED_BINARY_NOT_FOUND");
  const bytes = await input.readObject(binding.objectKey);
  if (!(bytes instanceof Uint8Array) || bytes.byteLength !== binding.byteLength) {
    return fail("MANAGED_BINARY_OBJECT_INTEGRITY_FAILURE");
  }
  const copy = Uint8Array.from(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy.buffer);
  const actual = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
  if (actual !== binding.sha256) return fail("MANAGED_BINARY_OBJECT_INTEGRITY_FAILURE");
  return copy;
}
