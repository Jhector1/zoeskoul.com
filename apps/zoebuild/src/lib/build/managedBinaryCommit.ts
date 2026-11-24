/**
 * AI4B4E2B2 — private atomic source-save integration boundary.
 *
 * Detached by design: no existing route calls this yet. A production adapter
 * MUST implement commitOwnedRevision as ONE database transaction that CAS-updates
 * CodeProject's source version, stores the stripped source head and immutable
 * source-history snapshot, and inserts the exact versioned manifest. If ANY
 * write fails, the entire transaction MUST roll back. Never pass stripped
 * workspaces to FullIDE, preview, runner, history or publication.
 *
 * The R2 staging port MUST only create private, unlisted objects; the journal
 * MUST be durable and must record upload intent BEFORE any R2 PUT. The existing
 * staging callback currently records completed objects, so that earlier helper
 * is NOT suitable for live activation until its pre-PUT recovery gap is closed.
 */
import {
  ManagedBinaryRevisionError,
  validateManagedBinaryRevision,
  type ManagedBinaryRevision,
  type ManagedBinaryScope,
  type ServerVerifiedBinaryAsset,
} from "./managedBinaryRevision";
import {
  stageCanonicalFullIDEImages,
  type PrivateStagingUpload,
} from "./managedBinaryStaging";
import {
  stripVerifiedManagedBinaryWorkspace,
  hydrateVerifiedManagedBinaryWorkspace,
  type ManagedWorkspace,
  type ManagedBinaryStoredSnapshot,
} from "./managedBinaryWorkspace";

export type ManagedBinaryAtomicCommit<W extends ManagedWorkspace> = Readonly<{
  scope: ManagedBinaryScope;
  expectedBaseVersion: number;
  sourceVersion: number;
  /** Distinct storage-only format. Never serialize it into an API response. */
  snapshot: ManagedBinaryStoredSnapshot<W>;
  /** Private server-only record. Never serialize its R2 keys to clients. */
  revision: ManagedBinaryRevision;
}>;

export type ManagedBinaryCommittedRead<W extends ManagedWorkspace> = Readonly<{
  kind: "managed";
  snapshot: ManagedBinaryStoredSnapshot<W>;
  revision: ManagedBinaryRevision;
}>;
export type ManagedBinaryLegacyRead<W extends ManagedWorkspace> = Readonly<{
  kind: "legacy";
  /** Caller MUST still apply the standard canonical workspace validator. */
  workspace: W;
}>;

/**
 * This interface is deliberately not an arbitrary "save snapshot" callback.
 * Its implementation is trusted server code, not a browser or request payload.
 * commitOwnedRevision MUST enforce the owner, active project, base-version CAS,
 * revision insertion, source-head update and all-or-nothing commit in one DB tx.
 */
export interface ManagedBinaryAtomicSourcePort<W extends ManagedWorkspace> {
  commitOwnedRevision(
    prepared: ManagedBinaryAtomicCommit<W>,
  ): Promise<Readonly<{kind: "committed"; sourceVersion: number}> | Readonly<{kind: "conflict"}>>;
  readOwnedRevision(input: Readonly<{
    scope: ManagedBinaryScope;
    sourceVersion: number;
  }>): Promise<ManagedBinaryCommittedRead<W> | ManagedBinaryLegacyRead<W> | null>;
}

function ensureVersion(baseVersion: number): number {
  if (!Number.isSafeInteger(baseVersion) || baseVersion < 1 || baseVersion >= Number.MAX_SAFE_INTEGER) {
    throw new ManagedBinaryRevisionError("MANAGED_ATOMIC_VERSION_INVALID");
  }
  return baseVersion + 1;
}

/**
 * Plan a new source write with byte-perfect R2 bindings and delegate the
 * all-or-nothing commit to a trusted DB port. No project is mutated by this
 * module itself. Staged R2 objects remain cleanup candidates after conflicts.
 */
export async function prepareAndCommitManagedBinaryRevision<W extends ManagedWorkspace>(input: Readonly<{
  scope: ManagedBinaryScope;
  baseVersion: number;
  previous: ManagedBinaryRevision;
  workspace: W;
  upload: PrivateStagingUpload;
  /** Must be durable; current staging implementation needs pre-PUT journaling before activation. */
  journal: (asset: ServerVerifiedBinaryAsset) => Promise<void>;
  port: ManagedBinaryAtomicSourcePort<W>;
}>): Promise<Readonly<{sourceVersion: number; stagedAssets: number}>> {
  const nextVersion = ensureVersion(input.baseVersion);
  validateManagedBinaryRevision(input.previous, input.scope, input.baseVersion);
  const staged = await stageCanonicalFullIDEImages({
    scope: input.scope,
    previous: input.previous,
    baseVersion: input.baseVersion,
    nodes: input.workspace.nodes,
    upload: input.upload,
    journal: input.journal,
  });
  const revision = validateManagedBinaryRevision(staged.revision, input.scope, nextVersion);
  const snapshot = await stripVerifiedManagedBinaryWorkspace({
    scope: input.scope,
    revision,
    sourceVersion: nextVersion,
    workspace: input.workspace,
  });
  const commit: ManagedBinaryAtomicCommit<W> = {
    scope: { ...input.scope }, expectedBaseVersion: input.baseVersion,
    sourceVersion: nextVersion, snapshot, revision,
  };
  const response = await input.port.commitOwnedRevision(commit);
  if (response?.kind === "conflict") {
    throw new ManagedBinaryRevisionError("MANAGED_ATOMIC_SOURCE_CONFLICT");
  }
  if (response?.kind !== "committed" || response.sourceVersion !== nextVersion) {
    throw new ManagedBinaryRevisionError("MANAGED_ATOMIC_COMMIT_INVALID");
  }
  return {sourceVersion: nextVersion, stagedAssets: staged.newlyStored.length};
}

/**
 * Read only one owner- and revision-scoped committed source. Restore verified
 * R2 bytes before handing the workspace to FullIDE/Runner/build/history logic.
 * Older legacy revisions retain their existing inline-binary representation.
 */
export async function loadHydratedManagedBinaryRevision<W extends ManagedWorkspace>(input: Readonly<{
  scope: ManagedBinaryScope;
  sourceVersion: number;
  port: ManagedBinaryAtomicSourcePort<W>;
  readObject: (key: string) => Promise<Uint8Array | null>;
}>): Promise<W | null> {
  ensureVersion(input.sourceVersion);
  const record = await input.port.readOwnedRevision({
    scope: {...input.scope}, sourceVersion: input.sourceVersion,
  });
  if (!record) return null;
  if (record.kind === "legacy") {
    if (!record.workspace || !Array.isArray(record.workspace.nodes)) {
      throw new ManagedBinaryRevisionError("MANAGED_ATOMIC_LEGACY_INVALID");
    }
    // The production reader must apply parseBuildWorkspaceMutation to this
    // legacy result. No R2 access or binary rewriting should occur.
    return record.workspace;
  }
  if (record.kind !== "managed") {
    throw new ManagedBinaryRevisionError("MANAGED_ATOMIC_RECORD_INVALID");
  }
  validateManagedBinaryRevision(record.revision, input.scope, input.sourceVersion);
  return hydrateVerifiedManagedBinaryWorkspace({
    scope: input.scope,
    revision: record.revision,
    sourceVersion: input.sourceVersion,
    stored: record.snapshot,
    readObject: input.readObject,
  });
}
