import "server-only";
/**
 * AI4B4E2C: private R2 ingress that writes a durable, owner-scoped upload
 * intent BEFORE issuing PUT. This is not a browser route or public gallery.
 * The existing staging bridge invokes upload() and, after it returns, journal().
 * Uncommitted intents remain private, and recovery is a separate future worker.
 */
import {Prisma,type PrismaClient} from "@zoeskoul/db";
import {assertManagedBinaryStorageBudget,generalManagedProjectEligible} from "./managedBinaryPrismaPolicy";
import {
  assertBuildMediaImageSignature,
  type BuildMediaPrivateObjectStore,
} from "@zoeskoul/build-application";
import {
  ManagedBinaryRevisionError,
  validateManagedBinaryPath,
  validateServerVerifiedBinaryAsset,
  type ManagedBinaryScope,
  type ServerVerifiedBinaryAsset,
} from "./managedBinaryRevision";
import type {PrivateStagingUpload} from "./managedBinaryStaging";

const MAX_BYTES = 5 * 1024 * 1024;
function fail(code: string): never { throw new ManagedBinaryRevisionError(code); }

async function sha256(bytes: Uint8Array): Promise<string> {
  const copy = Uint8Array.from(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy.buffer);
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join("");
}

export function createDurableManagedBinaryUploader(input: Readonly<{
  scope: ManagedBinaryScope;
  general?: boolean;
  baseVersion: number;
  client: PrismaClient;
  store: BuildMediaPrivateObjectStore;
  /** Real binary decoder from the trusted server. PNG only until vetted other decoders exist. */
  inspectPng: (bytes: Uint8Array) => Promise<Readonly<{mimeType: string}>>;
}>): Readonly<{
  upload: PrivateStagingUpload;
  journal: (asset: ServerVerifiedBinaryAsset) => Promise<void>;
}> {
  const {scope, baseVersion, client, store} = input;
  if (!Number.isSafeInteger(baseVersion) || baseVersion < 1) fail("MANAGED_UPLOAD_VERSION_INVALID");
  async function requireOwner(tx:Prisma.TransactionClient): Promise<void> {
    const project = await tx.buildProject.findFirst({
      where: {id: scope.buildProjectId, status: {not: "archived"},
        codeProject: {ownerId: scope.ownerId, archivedAt: null}},
      select: {stackId:true,codeProject: {select: {currentVersion: true,visibility:true,shareToken:true}}},
    });
    if (!project || project.codeProject.currentVersion !== baseVersion || (input.general && !generalManagedProjectEligible(project))) {
      return fail("MANAGED_UPLOAD_OWNER_OR_VERSION_INVALID");
    }
  }
  const upload: PrivateStagingUpload = async request => {
    // Current server image inspector supports real PNG decoding. Until other
    // formats have equivalent decoders, never claim they were validated.
    if (request.mimeType !== "image/png" || !(request.bytes instanceof Uint8Array) ||
        !request.bytes.byteLength || request.bytes.byteLength > MAX_BYTES) {
      return fail("MANAGED_UPLOAD_UNSUPPORTED_OR_OVERSIZE");
    }
    validateManagedBinaryPath(request.path, request.mimeType);
    const bytes = Uint8Array.from(request.bytes);
    assertBuildMediaImageSignature(bytes, request.mimeType);
    const inspected = await input.inspectPng(bytes);
    if (inspected.mimeType !== request.mimeType) return fail("MANAGED_UPLOAD_DECODE_MISMATCH");
    const sha = await sha256(bytes);
    const assetId = `asset_${crypto.randomUUID().replaceAll("-", "")}`;
    const objectKey = `project-media/${scope.ownerId}/${scope.buildProjectId}/${assetId}/${sha}`;
    const verified = validateServerVerifiedBinaryAsset({
      ...scope, assetId, objectKey, sha256: sha,
      mimeType: request.mimeType, byteLength: bytes.length,
    }, scope);
    // This INSERT commits independently BEFORE any R2 call. A crash or failed
    // PUT leaves a private PENDING journal entry, never a ready gallery asset.
    await client.$transaction(async tx => {
      await requireOwner(tx);
      // Serialize the budget predicate with the intent insert. No object I/O
      // inside the transaction; serialization failures never trigger a PUT.
      const account = await tx.buildManagedBinaryUploadIntent.aggregate({where:{ownerId:scope.ownerId},_sum:{byteLength:true},_count:true});
      const project = await tx.buildManagedBinaryUploadIntent.aggregate({where:{ownerId:scope.ownerId,buildProjectId:scope.buildProjectId},_sum:{byteLength:true},_count:true});
      assertManagedBinaryStorageBudget({owner:{bytes:account._sum.byteLength ?? 0,objects:account._count},
        project:{bytes:project._sum.byteLength ?? 0,objects:project._count},additionalBytes:bytes.length});
      await tx.buildManagedBinaryUploadIntent.create({data: {
        assetId, buildProjectId: scope.buildProjectId, ownerId: scope.ownerId,
        plannedBaseVersion: baseVersion, objectKey,
        sha256: sha, mimeType: request.mimeType, byteLength: bytes.length,
        state: "pending",
      }});
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
    const stored = await store.putIfAbsent({
      key: objectKey, bytes, mimeType: request.mimeType, sha256: sha,
    });
    if (stored !== "created" && stored !== "already-exists") {
      return fail("MANAGED_UPLOAD_R2_INVALID_RESULT");
    }
    if (stored === "already-exists") {
      const existing = await store.read(objectKey);
      if (!(existing instanceof Uint8Array) || existing.length !== bytes.length ||
          await sha256(existing) !== sha) return fail("MANAGED_UPLOAD_R2_COLLISION");
    }
    const updated = await client.buildManagedBinaryUploadIntent.updateMany({
      where: {assetId, ownerId: scope.ownerId, buildProjectId: scope.buildProjectId,
        state: "pending"},
      data: {state: "uploaded"},
    });
    if (updated.count !== 1) return fail("MANAGED_UPLOAD_JOURNAL_CONFLICT");
    return verified;
  };
  return {
    upload,
    journal: async asset => {
      const verified = validateServerVerifiedBinaryAsset(asset, scope);
      const row = await client.buildManagedBinaryUploadIntent.findFirst({
        where: {assetId: verified.assetId, buildProjectId: scope.buildProjectId,
          ownerId: scope.ownerId, state: "uploaded"},
      });
      if (!row || row.plannedBaseVersion !== baseVersion ||
          row.objectKey !== verified.objectKey || row.sha256 !== verified.sha256 ||
          row.mimeType !== verified.mimeType || row.byteLength !== verified.byteLength) {
        fail("MANAGED_UPLOAD_JOURNAL_UNVERIFIED");
      }
    },
  };
}
