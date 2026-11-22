import { docker } from "../docker/dockerClient.js";
import { adminSessionNetworkName, createAdminSessionNetwork, removeAdminSessionNetwork } from "./adminSessionNetwork.js";
import { adminEgressConfig, adminEgressProxyName, createAdminEgressProxy, removeAdminEgressProxy } from "./adminEgressProxy.js";
import { adminWorkspaceVolumeName, createAdminWorkspaceVolume, removeAdminWorkspaceVolume } from "./adminWorkspaceVolume.js";
import { adminLabSessionIsolationEnabled } from "./learningAdminSandbox.js";
import { assertAdminLabSwitch } from "./learningAdminSwitch.js";
import { confirmDockerResourceAbsent } from "./adminRevocationVerification.js";
import type { AdminLabResourceOperations } from "./adminLabRuntimeResources.js";

/** Trusted Docker bindings shared by legacy and future independent environment
 * lifecycle. The caller must already have verified the signed grant/image and
 * reserved capacity. No HTTP route directly calls these operations. */
export const adminResourceRemovalOperations = {
  networkName: adminSessionNetworkName,
  proxyName: adminEgressProxyName,
  volumeName: adminWorkspaceVolumeName,
  removeProxy: removeAdminEgressProxy,
  removeNetwork: removeAdminSessionNetwork,
  removeVolume: removeAdminWorkspaceVolume,
  networkAbsent: (name: string) => confirmDockerResourceAbsent(() => docker.getNetwork(name).inspect()),
  volumeAbsent: (name: string) => confirmDockerResourceAbsent(() => docker.getVolume(name).inspect()),
};

export function adminResourceOperations(generation: number, hardLifetimeMs: number, unified = false): AdminLabResourceOperations {
  if (!Number.isSafeInteger(generation) || generation < 0 || !Number.isSafeInteger(hardLifetimeMs) || hardLifetimeMs <= 0) {
    throw new Error("INVALID_ADMIN_RESOURCE_LEASE");
  }
  return {
    ...adminResourceRemovalOperations,
    assertAuthorized: () => { assertAdminLabSwitch(generation); },
    isolationEnabled: () => adminLabSessionIsolationEnabled(),
    egressImage: () => adminEgressConfig()?.image ?? null,
    createNetwork: createAdminSessionNetwork,
    createProxy: (id, network, image) => createAdminEgressProxy(id, network, image, undefined, process.env, {generation, hardLifetimeMs}),
    createVolume: (sessionId) => createAdminWorkspaceVolume(sessionId, unified),
  };
}
