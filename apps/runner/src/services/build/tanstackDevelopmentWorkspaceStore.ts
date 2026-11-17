import path from "node:path";
import type { FullStackPreviewLease, SharedFullStackPreviewRegistry } from "./sharedPreviewRegistry.js";
import { sharedFullStackPreviews } from "./sharedPreviewRegistry.js";
import type { TrustedTanstackDevelopmentWorkspace } from "./tanstackDevelopmentWorkspaceBinding.js";

/** Trusted Runner-only handle to a Docker-driver-allocated workspace.
 * No HTTP handler should ever accept or mint these inputs from a browser.
 * The registry is the authority for the *current* source revision; a stored
 * handle must not retain a stale version after an admitted source update.
 */
type DriverRecord = Readonly<{
  previewId: string;
  ownerKey: string;
  buildProjectId: string;
  containerId: string;
  workspaceRoot: string;
  workspaceDir: string;
}>;
const WORKSPACE_NAME = /^zoeskoul-run-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PREVIEW_NAME = /^preview_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** One private handle map per Runner process, never a separate preview lease registry. */
export class TrustedTanstackDevelopmentWorkspaceStore {
  private readonly records = new Map<string, DriverRecord>();
  constructor(private readonly registry: SharedFullStackPreviewRegistry) {}

  registerFromDriver(input: DriverRecord): void {
    if (!PREVIEW_NAME.test(input.previewId) || !input.ownerKey || !input.buildProjectId ||
        !input.containerId || this.records.has(input.previewId) ||
        !path.isAbsolute(input.workspaceRoot) || !path.isAbsolute(input.workspaceDir) ||
        path.resolve(input.workspaceRoot) !== input.workspaceRoot ||
        path.resolve(input.workspaceDir) !== input.workspaceDir ||
        path.dirname(input.workspaceDir) !== input.workspaceRoot ||
        !WORKSPACE_NAME.test(path.basename(input.workspaceDir)))
      throw new Error("Invalid trusted development workspace registration.");
    this.records.set(input.previewId, Object.freeze({...input}));
  }

  /** Derive revision/fingerprint from the registry's exact current object.
   * This permits successive CAS-approved edits without trusting a browser
   * to advance the driver handle's source version. */
  resolve(lease: FullStackPreviewLease): TrustedTanstackDevelopmentWorkspace | null {
    const record = this.records.get(lease.id);
    if (!record || this.registry.get(lease.id) !== lease ||
        lease.mode !== "development" || lease.basePath.startsWith("/quarantined/") ||
        record.previewId !== lease.id || record.ownerKey !== lease.ownerKey ||
        record.buildProjectId !== lease.buildProjectId ||
        record.containerId !== lease.containerId ||
        !Number.isSafeInteger(lease.sourceVersion) || lease.sourceVersion < 1 ||
        !lease.identity?.fingerprint) return null;
    return Object.freeze({ ...record, sourceVersion: lease.sourceVersion,
      identityFingerprint: lease.identity.fingerprint });
  }

  /** Revocation occurs only after confirmed Docker/workspace cleanup. */
  revoke(previewId: string, containerId: string): void {
    if (this.records.get(previewId)?.containerId === containerId)
      this.records.delete(previewId);
  }
}

export const trustedTanstackDevelopmentWorkspaces =
  new TrustedTanstackDevelopmentWorkspaceStore(sharedFullStackPreviews);
