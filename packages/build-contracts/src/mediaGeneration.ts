/**
 * ZoeBuild AI4A — project-owned, provider-neutral generated media contracts.
 *
 * Pure domain validation only. It does NOT authorize storage reads, spend credits,
 * run models, mark provider connections active or save generated application source.
 * Those require authenticated, server-side implementations in later AI4 waves.
 */
export const BUILD_MEDIA_KINDS = ["image", "video"] as const;
export type BuildMediaKind = (typeof BUILD_MEDIA_KINDS)[number];
export const BUILD_MEDIA_MODES = ["draft", "final"] as const;
export type BuildMediaMode = (typeof BUILD_MEDIA_MODES)[number];
export const BUILD_MEDIA_JOB_STATES = ["queued", "running", "verifying", "ready", "failed", "cancelled"] as const;
export type BuildMediaJobState = (typeof BUILD_MEDIA_JOB_STATES)[number];
export type BuildMediaOrigin = "generated" | "uploaded";
export type BuildMediaVisibility = "private" | "public";

/** The current BuildProject -> CodeProject relation establishes an ownerId. */
export type BuildMediaProjectScope = Readonly<{
  ownerId: string;
  buildProjectId: string;
}>;

export type BuildMediaGenerationRequest = Readonly<{
  scope: BuildMediaProjectScope;
  idempotencyKey: string;
  kind: BuildMediaKind;
  mode: BuildMediaMode;
  instruction: string;
  referenceAssetIds: readonly string[];
}>;

export type BuildMediaJob = Readonly<{
  id: string;
  scope: BuildMediaProjectScope;
  kind: BuildMediaKind;
  mode: BuildMediaMode;
  idempotencyKey: string;
  state: BuildMediaJobState;
  /** Server-verified selection only; never trusted from an AI prompt. */
  providerId: string | null;
  modelId: string | null;
}>;

export type BuildMediaAsset = Readonly<{
  id: string;
  scope: BuildMediaProjectScope;
  kind: BuildMediaKind;
  origin: BuildMediaOrigin;
  visibility: BuildMediaVisibility;
  state: "ready";
  sha256: string;
  objectKey: string;
  mimeType: string;
  byteLength: number;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  altText: string | null;
  providerId: string | null;
  modelId: string | null;
}>;

/** Capability registration is NOT connectivity, price approval or authorization. */
export type BuildMediaProviderCapability = Readonly<{
  providerId: string;
  modelId: string;
  kinds: readonly BuildMediaKind[];
  modes: readonly BuildMediaMode[];
  acceptsReferenceAssets: boolean;
  asynchronous: boolean;
}>;

export type BuildMediaProviderAvailability = Readonly<{
  providerId: string;
  modelId: string;
  /** Trusted server observation, not a model-generated claim. */
  configured: boolean;
  /** Optional measured benchmark: never an invented speed claim. */
  measuredP95Ms?: number;
}>;

export class BuildMediaContractError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
    this.name = "BuildMediaContractError";
  }
}

const ID = /^[A-Za-z0-9_-]{4,128}$/;
const ASSET_ID = /^[A-Za-z0-9_-]{10,128}$/;
const PROVIDER_ID = /^[a-z][a-z0-9-]{1,63}$/;
const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,127}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const MIME: Readonly<Record<BuildMediaKind, readonly string[]>> = {
  image: ["image/jpeg", "image/png", "image/webp", "image/avif"],
  video: ["video/mp4", "video/webm"],
};
export const BUILD_MEDIA_LIMITS = {
  instructionChars: 8_000,
  references: 4,
  imageBytes: 20 * 1024 * 1024,
  videoBytes: 512 * 1024 * 1024,
  imageDimension: 16_384,
  videoDurationMs: 10 * 60 * 1_000,
  altTextChars: 300,
} as const;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BuildMediaContractError("BUILD_MEDIA_INVALID_RECORD");
  }
  return value as Record<string, unknown>;
}
function onlyKeys(value: Record<string, unknown>, allowed: readonly string[]): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new BuildMediaContractError("BUILD_MEDIA_UNKNOWN_FIELD");
  }
}
function match(value: unknown, pattern: RegExp, code: string): string {
  if (typeof value !== "string" || !pattern.test(value)) {
    throw new BuildMediaContractError(code);
  }
  return value;
}
function member<T extends string>(value: unknown, allowed: readonly T[], code: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new BuildMediaContractError(code);
  }
  return value as T;
}
function int(value: unknown, low: number, high: number, code: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < low || value > high) {
    throw new BuildMediaContractError(code);
  }
  return value;
}

export function parseBuildMediaScope(value: unknown): BuildMediaProjectScope {
  const obj = record(value);
  onlyKeys(obj, ["ownerId", "buildProjectId"]);
  return {
    ownerId: match(obj.ownerId, ID, "BUILD_MEDIA_OWNER_INVALID"),
    buildProjectId: match(obj.buildProjectId, ID, "BUILD_MEDIA_PROJECT_INVALID"),
  };
}

export function assertSameBuildMediaScope(
  expected: BuildMediaProjectScope,
  actual: BuildMediaProjectScope,
): void {
  const safeExpected = parseBuildMediaScope(expected);
  const safeActual = parseBuildMediaScope(actual);
  if (safeExpected.ownerId !== safeActual.ownerId ||
      safeExpected.buildProjectId !== safeActual.buildProjectId) {
    throw new BuildMediaContractError("BUILD_MEDIA_SCOPE_MISMATCH");
  }
}

/** Parsing does not authenticate identity. The route must derive scope from the DB. */
export function parseBuildMediaGenerationRequest(
  value: unknown,
  trustedScope: BuildMediaProjectScope,
): BuildMediaGenerationRequest {
  const obj = record(value);
  onlyKeys(obj, ["idempotencyKey", "kind", "mode", "instruction", "referenceAssetIds"]);
  const instruction = obj.instruction;
  if (typeof instruction !== "string" || !instruction.trim() ||
      instruction.length > BUILD_MEDIA_LIMITS.instructionChars) {
    throw new BuildMediaContractError("BUILD_MEDIA_INSTRUCTION_INVALID");
  }
  const refs = obj.referenceAssetIds;
  if (!Array.isArray(refs) || refs.length > BUILD_MEDIA_LIMITS.references ||
      refs.some((id) => typeof id !== "string" || !ASSET_ID.test(id)) ||
      new Set(refs).size !== refs.length) {
    throw new BuildMediaContractError("BUILD_MEDIA_REFERENCES_INVALID");
  }
  return {
    scope: parseBuildMediaScope(trustedScope),
    idempotencyKey: match(obj.idempotencyKey, ID, "BUILD_MEDIA_IDEMPOTENCY_INVALID"),
    kind: member(obj.kind, BUILD_MEDIA_KINDS, "BUILD_MEDIA_KIND_INVALID"),
    mode: member(obj.mode, BUILD_MEDIA_MODES, "BUILD_MEDIA_MODE_INVALID"),
    instruction: instruction.trim(),
    referenceAssetIds: [...refs] as string[],
  };
}

/** Stable, private object key, never an external URL or client-selected path. */
export function buildMediaObjectKey(
  scope: BuildMediaProjectScope,
  assetId: string,
  contentSha256: string,
): string {
  const s = parseBuildMediaScope(scope);
  const id = match(assetId, ASSET_ID, "BUILD_MEDIA_ASSET_ID_INVALID");
  const digest = match(contentSha256, SHA256, "BUILD_MEDIA_HASH_INVALID");
  return `project-media/${s.ownerId}/${s.buildProjectId}/${id}/${digest}`;
}

export function parseBuildMediaAsset(value: unknown, expectedScope: BuildMediaProjectScope): BuildMediaAsset {
  const obj = record(value);
  onlyKeys(obj, ["id", "scope", "kind", "origin", "visibility", "state", "sha256", "objectKey", "mimeType", "byteLength", "width", "height", "durationMs", "altText", "providerId", "modelId"]);
  const scope = parseBuildMediaScope(obj.scope);
  assertSameBuildMediaScope(expectedScope, scope);
  const id = match(obj.id, ASSET_ID, "BUILD_MEDIA_ASSET_ID_INVALID");
  const digest = match(obj.sha256, SHA256, "BUILD_MEDIA_HASH_INVALID");
  if (obj.state !== "ready") throw new BuildMediaContractError("BUILD_MEDIA_ASSET_NOT_READY");
  const kind = member(obj.kind, BUILD_MEDIA_KINDS, "BUILD_MEDIA_KIND_INVALID");
  const origin = member(obj.origin, ["uploaded", "generated"], "BUILD_MEDIA_ORIGIN_INVALID");
  const visibility = member(obj.visibility, ["private", "public"], "BUILD_MEDIA_VISIBILITY_INVALID");
  const expectedKey = buildMediaObjectKey(scope, id, digest);
  if (obj.objectKey !== expectedKey) throw new BuildMediaContractError("BUILD_MEDIA_OBJECT_KEY_MISMATCH");
  const mimeType = member(obj.mimeType, MIME[kind], "BUILD_MEDIA_MIME_INVALID");
  const byteLength = int(obj.byteLength, 1, kind === "image" ? BUILD_MEDIA_LIMITS.imageBytes : BUILD_MEDIA_LIMITS.videoBytes, "BUILD_MEDIA_SIZE_INVALID");
  const width = obj.width === null ? null : int(obj.width, 1, BUILD_MEDIA_LIMITS.imageDimension, "BUILD_MEDIA_DIMENSIONS_INVALID");
  const height = obj.height === null ? null : int(obj.height, 1, BUILD_MEDIA_LIMITS.imageDimension, "BUILD_MEDIA_DIMENSIONS_INVALID");
  if ((width === null) !== (height === null)) throw new BuildMediaContractError("BUILD_MEDIA_DIMENSIONS_INVALID");
  if (kind === "image" && (width === null || obj.durationMs !== null)) throw new BuildMediaContractError("BUILD_MEDIA_IMAGE_METADATA_INVALID");
  const durationMs = obj.durationMs === null ? null : int(obj.durationMs, 1, BUILD_MEDIA_LIMITS.videoDurationMs, "BUILD_MEDIA_DURATION_INVALID");
  if (kind === "video" && durationMs === null) throw new BuildMediaContractError("BUILD_MEDIA_VIDEO_METADATA_INVALID");
  const altText = obj.altText;
  if (altText !== null && (typeof altText !== "string" || altText.length > BUILD_MEDIA_LIMITS.altTextChars)) {
    throw new BuildMediaContractError("BUILD_MEDIA_ALT_TEXT_INVALID");
  }
  const providerId = obj.providerId === null ? null : match(obj.providerId, PROVIDER_ID, "BUILD_MEDIA_PROVIDER_INVALID");
  const modelId = obj.modelId === null ? null : match(obj.modelId, MODEL_ID, "BUILD_MEDIA_MODEL_INVALID");
  if ((providerId === null) !== (modelId === null) || (origin === "generated" && providerId === null) ||
      (origin === "uploaded" && providerId !== null)) {
    throw new BuildMediaContractError("BUILD_MEDIA_PROVENANCE_INVALID");
  }
  return { id, scope, kind, origin, visibility, state: "ready", sha256: digest, objectKey: expectedKey, mimeType, byteLength, width, height, durationMs, altText, providerId, modelId };
}

/** A handle is not a public URL or an access grant; resolution is server-owned. */
export function buildMediaAssetHandle(assetId: string): string {
  return `zoebuild:asset:${match(assetId, ASSET_ID, "BUILD_MEDIA_ASSET_ID_INVALID")}`;
}

const JOB_TRANSITIONS: Readonly<Record<BuildMediaJobState, readonly BuildMediaJobState[]>> = {
  queued: ["running", "cancelled", "failed"],
  running: ["verifying", "failed", "cancelled"],
  verifying: ["ready", "failed", "cancelled"],
  ready: [], failed: [], cancelled: [],
};
export function assertBuildMediaJobTransition(from: BuildMediaJobState, to: BuildMediaJobState): void {
  member(from, BUILD_MEDIA_JOB_STATES, "BUILD_MEDIA_JOB_STATE_INVALID");
  member(to, BUILD_MEDIA_JOB_STATES, "BUILD_MEDIA_JOB_STATE_INVALID");
  if (!JOB_TRANSITIONS[from].includes(to)) {
    throw new BuildMediaContractError("BUILD_MEDIA_JOB_TRANSITION_INVALID");
  }
}

/** No hardcoded model or application category list. Metadata alone cannot grant access. */
export function listEligibleBuildMediaProviders(input: Readonly<{
  request: Pick<BuildMediaGenerationRequest, "kind" | "mode" | "referenceAssetIds">;
  capabilities: readonly BuildMediaProviderCapability[];
  availability: readonly BuildMediaProviderAvailability[];
}>): readonly BuildMediaProviderCapability[] {
  const { request } = input;
  member(request.kind, BUILD_MEDIA_KINDS, "BUILD_MEDIA_KIND_INVALID");
  member(request.mode, BUILD_MEDIA_MODES, "BUILD_MEDIA_MODE_INVALID");
  if (!Array.isArray(request.referenceAssetIds)) throw new BuildMediaContractError("BUILD_MEDIA_REFERENCES_INVALID");
  const unique = new Set<string>();
  for (const cap of input.capabilities) {
    match(cap.providerId, PROVIDER_ID, "BUILD_MEDIA_PROVIDER_INVALID");
    match(cap.modelId, MODEL_ID, "BUILD_MEDIA_MODEL_INVALID");
    if (!cap.kinds.length || !cap.modes.length || cap.kinds.some(k => !BUILD_MEDIA_KINDS.includes(k)) ||
        cap.modes.some(m => !BUILD_MEDIA_MODES.includes(m)) || typeof cap.acceptsReferenceAssets !== "boolean" ||
        typeof cap.asynchronous !== "boolean") throw new BuildMediaContractError("BUILD_MEDIA_CAPABILITY_INVALID");
    const key = JSON.stringify([cap.providerId, cap.modelId]);
    if (unique.has(key)) throw new BuildMediaContractError("BUILD_MEDIA_DUPLICATE_CAPABILITY");
    unique.add(key);
  }
  const seen = new Set<string>();
  const available = new Map<string, BuildMediaProviderAvailability>();
  for (const status of input.availability) {
    match(status.providerId, PROVIDER_ID, "BUILD_MEDIA_PROVIDER_INVALID");
    match(status.modelId, MODEL_ID, "BUILD_MEDIA_MODEL_INVALID");
    if (typeof status.configured !== "boolean" ||
        (status.measuredP95Ms !== undefined && (typeof status.measuredP95Ms !== "number" ||
          !Number.isFinite(status.measuredP95Ms) || status.measuredP95Ms <= 0))) {
      throw new BuildMediaContractError("BUILD_MEDIA_AVAILABILITY_INVALID");
    }
    const key = JSON.stringify([status.providerId, status.modelId]);
    if (seen.has(key)) throw new BuildMediaContractError("BUILD_MEDIA_DUPLICATE_AVAILABILITY");
    seen.add(key);
    available.set(key, status);
  }
  return input.capabilities.filter((cap) => {
    const status = available.get(JSON.stringify([cap.providerId, cap.modelId]));
    return status?.configured === true && cap.kinds.includes(request.kind) && cap.modes.includes(request.mode) &&
      (!request.referenceAssetIds.length || cap.acceptsReferenceAssets);
  }).sort((a, b) => {
    const at = available.get(JSON.stringify([a.providerId, a.modelId]))?.measuredP95Ms;
    const bt = available.get(JSON.stringify([b.providerId, b.modelId]))?.measuredP95Ms;
    return at !== undefined && bt !== undefined ? at - bt : 0;
  });
}
