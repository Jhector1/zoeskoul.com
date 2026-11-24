/** Pure server-only persistence policy; no Prisma import or live database mutation. */
import { ManagedBinaryRevisionError, type ManagedBinaryBinding, type ManagedBinaryScope } from "./managedBinaryRevision";

function fail(code: string): never { throw new ManagedBinaryRevisionError(code); }

/** No request-supplied object key can bypass the durable, project-owned intent journal. */
export function assertCommittedManagedBinaryIntents(
  bindings: readonly ManagedBinaryBinding[],
  scope: ManagedBinaryScope,
  baseVersion: number,
  intents: readonly Readonly<{
    assetId: string;
    ownerId: string;
    buildProjectId: string;
    plannedBaseVersion: number;
    objectKey: string;
    sha256: string;
    mimeType: string;
    byteLength: number;
    state: string;
  }>[],
): readonly string[] {
  const byId = new Map(intents.map(item => [item.assetId, item]));
  const newlyUploaded: string[] = [];
  for (const binding of bindings) {
    const intent = byId.get(binding.assetId);
    if (!intent || intent.ownerId !== scope.ownerId ||
        intent.buildProjectId !== scope.buildProjectId ||
        intent.objectKey !== binding.objectKey || intent.sha256 !== binding.sha256 ||
        intent.mimeType !== binding.mimeType || intent.byteLength !== binding.byteLength ||
        (intent.state !== "uploaded" && intent.state !== "committed")) {
      return fail("MANAGED_DB_ASSET_INTENT_UNVERIFIED");
    }
    if (intent.state === "uploaded") {
      if (intent.plannedBaseVersion !== baseVersion) {
        return fail("MANAGED_DB_ASSET_INTENT_STALE");
      }
      newlyUploaded.push(intent.assetId);
    }
  }
  return [...new Set(newlyUploaded)];
}


/** Server-owned rollout selection. Keep explicit disposable pilot identity on
 * its stricter lane; general activation never bypasses its database guard. */
export function managedBinaryWriteLane(projectId:string, env:Readonly<Record<string,string|undefined>>=process.env): "pilot" | "general" | null {
  if (!projectId || env.ZOEBUILD_MANAGED_R2_WRITES !== "1") return null;
  if (env.ZOEBUILD_MANAGED_R2_PILOT_PROJECT_ID === projectId) return "pilot";
  return env.ZOEBUILD_MANAGED_R2_READS === "1" && env.ZOEBUILD_MANAGED_R2_GENERAL_WRITES === "1" ? "general" : null;
}

export function generalManagedProjectEligible(project:Readonly<{stackId:string|null;codeProject:Readonly<{visibility:string;shareToken:string|null}>}>):boolean {
  return project.stackId === "tanstack-start-v1" && project.codeProject.visibility === "private" && project.codeProject.shareToken === null;
}

// Conservative initial admission budgets, not billing-plan entitlements or
// actual R2 usage measurements. Include ALL journal intents (even pending and
// abandoned), so retries, replacement and retained history cannot bypass them.
export const MANAGED_BINARY_STORAGE_BUDGET = {
  project: {bytes:50*1024*1024, objects:500},
  owner: {bytes:100*1024*1024, objects:1000},
} as const;
export function assertManagedBinaryStorageBudget(input:Readonly<{
  project:{bytes:number;objects:number}; owner:{bytes:number;objects:number}; additionalBytes:number;
}>):void {
  if (!Number.isSafeInteger(input.additionalBytes) || input.additionalBytes <= 0) fail("MANAGED_UPLOAD_BUDGET_INVALID");
  for (const key of ["project","owner"] as const) {
    const usage=input[key], limit=MANAGED_BINARY_STORAGE_BUDGET[key];
    if (!Number.isSafeInteger(usage.bytes) || usage.bytes < 0 || !Number.isSafeInteger(usage.objects) || usage.objects < 0)
      fail("MANAGED_UPLOAD_BUDGET_INVALID");
    if (usage.bytes > limit.bytes - input.additionalBytes || usage.objects >= limit.objects)
      fail("MANAGED_UPLOAD_STORAGE_LIMIT");
  }
}
