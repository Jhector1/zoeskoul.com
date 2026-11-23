import type { ProductionBuildJobRequestV1 } from "@zoeskoul/build-executor-contracts";
import type { FullStackPreviewLease, SharedFullStackPreviewRegistry } from "./sharedPreviewRegistry.js";
import { sharedFullStackPreviews } from "./sharedPreviewRegistry.js";
import { createTanstackPreviewIdentity } from "./tanstackPreviewIdentity.js";

/**
 * Runner-owned previous-source snapshot for a development preview.
 * An HTTP caller must never supply the previous request during an update:
 * it is recovered from the exact live lease and its originally admitted source.
 *
 * This is private/in-process and deliberately has no public read or write route.
 * The future coordinator must advance it only after an exclusive successful
 * source-version CAS; on failure it must quarantine and close the lease.
 */
type SourceRecord = Readonly<{
  previewId: string;
  ownerKey: string;
  buildProjectId: string;
  containerId: string;
  source: ProductionBuildJobRequestV1;
}>;

function copySource(source: ProductionBuildJobRequestV1): ProductionBuildJobRequestV1 {
  return Object.freeze({
    protocolVersion: source.protocolVersion,
    operation: source.operation,
    buildProjectId: source.buildProjectId,
    sourceVersion: source.sourceVersion,
    stackId: source.stackId,
    templateId: source.templateId,
    files: Object.freeze(source.files.map(file => Object.freeze({path:file.path,content:file.content}))),
    ...(source.binaryFiles === undefined ? {} : {binaryFiles:Object.freeze(source.binaryFiles.map(file => Object.freeze({...file})))}),
  });
}

function sourceMatchesLease(source: ProductionBuildJobRequestV1, lease: FullStackPreviewLease): boolean {
  if (source.operation !== "production-build" ||
      source.stackId !== "tanstack-start-v1" || source.templateId !== "tanstack-start-v1" ||
      source.buildProjectId !== lease.buildProjectId ||
      source.sourceVersion !== lease.sourceVersion ||
      !Number.isSafeInteger(source.sourceVersion) || source.sourceVersion < 1)
    return false;
  try {
    const identity = createTanstackPreviewIdentity(source, lease.identity.runtimeImageId);
    return identity.fingerprint === lease.identity.fingerprint &&
      identity.sourceFingerprint === lease.identity.sourceFingerprint &&
      identity.dependencyFingerprint === lease.identity.dependencyFingerprint &&
      identity.runtimeImageId === lease.identity.runtimeImageId;
  } catch { return false; }
}

export class TrustedTanstackDevelopmentSourceStore {
  private readonly records = new Map<string, SourceRecord>();
  constructor(private readonly registry: SharedFullStackPreviewRegistry) {}

  /** Minted only by a trusted, authorized Runner start after Docker readiness. */
  registerFromAdmittedStart(input: Readonly<{
    previewId: string; ownerKey: string; buildProjectId: string;
    containerId: string; source: ProductionBuildJobRequestV1;
  }>): void {
    if (!/^preview_[0-9a-f-]{36}$/i.test(input.previewId) || !input.ownerKey ||
        !input.buildProjectId || !input.containerId ||
        this.records.has(input.previewId) ||
        input.source.operation !== "production-build" ||
        input.source.buildProjectId !== input.buildProjectId ||
        !Number.isSafeInteger(input.source.sourceVersion) || input.source.sourceVersion < 1 ||
        input.source.stackId !== "tanstack-start-v1" ||
        input.source.templateId !== "tanstack-start-v1")
      throw new Error("Invalid trusted development source registration.");
    this.records.set(input.previewId, Object.freeze({...input, source:copySource(input.source)}));
  }

  /** Returns a frozen copy only for the exact canonical, currently registered
   * development lease. A caller cannot forge an older version or different
   * identity, even if it knows the actor's key or the preview identifier. */
  resolve(lease: FullStackPreviewLease): ProductionBuildJobRequestV1 | null {
    const record = this.records.get(lease.id);
    if (!record || this.registry.get(lease.id) !== lease ||
        lease.mode !== "development" || lease.basePath.startsWith("/quarantined/") ||
        record.previewId !== lease.id || record.ownerKey !== lease.ownerKey ||
        record.buildProjectId !== lease.buildProjectId ||
        record.containerId !== lease.containerId ||
        !sourceMatchesLease(record.source,lease)) return null;
    return copySource(record.source);
  }

  /** This method will be called within the exclusive coordinator slot only
   * AFTER registry.commitDevelopmentUpdate has succeeded. The caller MUST
   * quarantine on any failure; the previous snapshot is never guessed. */
  advanceAfterCommittedLease(lease: FullStackPreviewLease,
    next: ProductionBuildJobRequestV1): void {
    const record = this.records.get(lease.id);
    if (!record || this.registry.get(lease.id) !== lease ||
        lease.mode !== "development" || lease.basePath.startsWith("/quarantined/") ||
        record.ownerKey !== lease.ownerKey || record.buildProjectId !== lease.buildProjectId ||
        record.containerId !== lease.containerId ||
        !Number.isSafeInteger(record.source.sourceVersion) ||
        record.source.sourceVersion >= lease.sourceVersion ||
        !sourceMatchesLease(next,lease))
      throw new Error("Development preview committed source identity mismatch.");
    this.records.set(lease.id, Object.freeze({...record,source:copySource(next)}));
  }

  /** Revocation only occurs after verified Docker teardown. */
  revoke(previewId: string, containerId: string): void {
    if (this.records.get(previewId)?.containerId === containerId)
      this.records.delete(previewId);
  }
}

export const trustedTanstackDevelopmentSources =
  new TrustedTanstackDevelopmentSourceStore(sharedFullStackPreviews);
