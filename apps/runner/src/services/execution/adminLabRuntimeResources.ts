/** Reusable infrastructure preparation for an already authorized disposable lab.
 * The caller owns the reservation, guest creation, grant checks and cleanup.
 * Record deterministic resource identities BEFORE issuing any create: a daemon
 * can allocate a resource and then fail to return its acknowledgement.
 * This is not a new admission path and never accepts browser-supplied names.
 */
export type AdminLabResourceEvidence = {
  networkName: string | null;
  proxyName: string | null;
  volumeName: string | null;
};
export function emptyAdminLabResources(): AdminLabResourceEvidence {
  return {networkName:null, proxyName:null, volumeName:null};
}
export interface AdminLabResourceOperations {
  assertAuthorized(): void;
  isolationEnabled(): boolean;
  egressImage(): string | null;
  networkName(sessionId:string): string;
  proxyName(sessionId:string): string;
  volumeName(sessionId:string): string;
  createNetwork(sessionId:string): Promise<string>;
  createProxy(sessionId:string, networkName:string, image:string): Promise<string>;
  createVolume(sessionId:string): Promise<string>;
  removeProxy(name:string, sessionId:string): Promise<void>;
  removeNetwork(name:string, sessionId:string): Promise<void>;
  removeVolume(name:string, sessionId:string): Promise<void>;
  networkAbsent(name:string): Promise<boolean>;
  volumeAbsent(name:string): Promise<boolean>;
}
/** Call only under the owner's lifecycle reservation, after image and sandbox
 * validation. The evidence belongs to the caller even when this throws. */
export async function prepareAdminLabResources(sessionId:string,
  evidence:AdminLabResourceEvidence, ops:AdminLabResourceOperations):Promise<void> {
  if (evidence.networkName || evidence.proxyName || evidence.volumeName) throw new Error("ADMIN_RESOURCE_EVIDENCE_NOT_EMPTY");
  ops.assertAuthorized();
  if (ops.isolationEnabled()) {
    evidence.networkName=ops.networkName(sessionId);
    if (await ops.createNetwork(sessionId)!==evidence.networkName) throw new Error("ADMIN_NETWORK_IDENTITY_MISMATCH");
    ops.assertAuthorized();
    const image=ops.egressImage();
    if (image) {
      evidence.proxyName=ops.proxyName(sessionId);
      if (await ops.createProxy(sessionId,evidence.networkName,image)!==evidence.proxyName) throw new Error("ADMIN_PROXY_IDENTITY_MISMATCH");
      ops.assertAuthorized();
    }
  }
  evidence.volumeName=ops.volumeName(sessionId);
  if (await ops.createVolume(sessionId)!==evidence.volumeName) throw new Error("ADMIN_VOLUME_IDENTITY_MISMATCH");
  ops.assertAuthorized();
}
/** Cleanup for an already-ended guest. All identity validation happens before
 * any mutation. The proxy helper verifies gateway, firewall and holder removal.
 * The caller MUST independently verify guest absence, and hold lifecycle lock.
 * Do not use this for an unconfirmed live environment. */
export async function removeVerifiedAdminLabResources(sessionId:string,
  evidence:Readonly<AdminLabResourceEvidence>, ops:Pick<AdminLabResourceOperations,
  "networkName"|"proxyName"|"volumeName"|"removeProxy"|"removeNetwork"|"removeVolume"|"networkAbsent"|"volumeAbsent">):Promise<void> {
  if ((evidence.networkName!==null && evidence.networkName!==ops.networkName(sessionId)) ||
      (evidence.proxyName!==null && (!evidence.networkName || evidence.proxyName!==ops.proxyName(sessionId))) ||
      (evidence.volumeName!==null && evidence.volumeName!==ops.volumeName(sessionId))) throw new Error("ADMIN_RESOURCE_IDENTITY_MISMATCH");
  if (evidence.proxyName) await ops.removeProxy(evidence.proxyName,sessionId);
  if (evidence.networkName) {
    await ops.removeNetwork(evidence.networkName,sessionId);
    if (!await ops.networkAbsent(evidence.networkName)) throw new Error("Previous administrator network remains.");
  }
  if (evidence.volumeName) {
    await ops.removeVolume(evidence.volumeName,sessionId);
    if (!await ops.volumeAbsent(evidence.volumeName)) throw new Error("Previous administrator volume remains.");
  }
}
