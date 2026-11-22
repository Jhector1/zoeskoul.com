/** Pure, server-side contract for the future unified interactive Linux runtime.
 * No launch path calls this yet. Policy inputs must come from trusted configuration,
 * authenticated entitlements and verified runtime evidence, never browser fields.
 */
export const linuxCapabilities = [
  "administrator", "repositoryAccess", "protectedEgress", "workspaceSync",
  "rootSafeWorkspaceSync", "systemd", "persistentStorage", "rootSafePersistence",
  "webPreview", "reset",
] as const;
export type LinuxCapability = typeof linuxCapabilities[number];
export const linuxLimits = ["maxTerminals", "memoryMiB", "cpuMillicores", "pids", "diskMiB", "idleMinutes", "lifetimeMinutes"] as const;
export type LinuxLimit = typeof linuxLimits[number];
export type LinuxPolicy = Readonly<{
  capabilities: Readonly<Record<LinuxCapability, boolean>>;
  limits: Readonly<Record<LinuxLimit, number>>;
}>;
const hardCeilings: Record<LinuxLimit, number> = {
  maxTerminals: 8, memoryMiB: 4096, cpuMillicores: 2000, pids: 512,
  diskMiB: 16384, idleMinutes: 120, lifetimeMinutes: 480,
};
const minimums: Record<LinuxLimit, number> = {
  maxTerminals: 1, memoryMiB: 64, cpuMillicores: 100, pids: 16,
  diskMiB: 64, idleMinutes: 1, lifetimeMinutes: 1,
};
function exactKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value) &&
    Reflect.ownKeys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k));
}
export function isLinuxPolicy(value: unknown): value is LinuxPolicy {
  if (!exactKeys(value, ["capabilities", "limits"])) return false;
  const { capabilities, limits } = value;
  if (!exactKeys(capabilities, linuxCapabilities) || !exactKeys(limits, linuxLimits)) return false;
  return linuxCapabilities.every(k => typeof capabilities[k] === "boolean") &&
    linuxLimits.every(k => {
      const n = limits[k];
      return typeof n === "number" && Number.isSafeInteger(n) && n >= minimums[k] && n <= hardCeilings[k];
    }) && Number(limits.idleMinutes) <= Number(limits.lifetimeMinutes);
}
export type LinuxPolicyResolution = Readonly<{ok: true; policy: LinuxPolicy}> |
  Readonly<{ok: false; reason: "INVALID_POLICY" | "CAPABILITY_DENIED" | "UNSAFE_COMBINATION"; capability?: LinuxCapability}>;
/** All five layers are mandatory. Requests select, never confer, capabilities.
 * Numeric requests are bounded by every layer. Unsupported features fail closed.
 * repositoryAccess means approved network repository access, NOT a promise that
 * an administrator cannot install software from already available local bytes.
 */
export function resolveUnifiedLinuxPolicy(input: Readonly<{
  platform: unknown; organization: unknown; course: unknown; entitlement: unknown;
  verifiedRuntime: unknown; requested: unknown;
}>): LinuxPolicyResolution {
  const layers = [input.platform, input.organization, input.course, input.entitlement, input.verifiedRuntime];
  const request = input.requested;
  if (!layers.every(isLinuxPolicy) || !isLinuxPolicy(request)) return {ok:false, reason:"INVALID_POLICY"};
  const capabilities = {} as Record<LinuxCapability, boolean>;
  for (const k of linuxCapabilities) {
    if (request.capabilities[k] && !layers.every(layer => layer.capabilities[k])) {
      return {ok:false, reason:"CAPABILITY_DENIED", capability:k};
    }
    capabilities[k] = request.capabilities[k];
  }
  // Privilege, sync and persistence are different trust boundaries. A root-safe
  // implementation must be independently verified before enabling combinations.
  if ((capabilities.repositoryAccess && !capabilities.protectedEgress) ||
      (capabilities.rootSafeWorkspaceSync && !capabilities.workspaceSync) ||
      (capabilities.rootSafePersistence && !capabilities.persistentStorage) ||
      (capabilities.administrator && capabilities.workspaceSync && !capabilities.rootSafeWorkspaceSync) ||
      (capabilities.administrator && capabilities.persistentStorage && !capabilities.rootSafePersistence)) {
    return {ok:false, reason:"UNSAFE_COMBINATION"};
  }
  const limits = {} as Record<LinuxLimit, number>;
  for (const k of linuxLimits) limits[k] = Math.min(request.limits[k], ...layers.map(l => l.limits[k]));
  limits.idleMinutes = Math.min(limits.idleMinutes, limits.lifetimeMinutes);
  return {ok:true, policy:Object.freeze({capabilities:Object.freeze(capabilities), limits:Object.freeze(limits)})};
}
