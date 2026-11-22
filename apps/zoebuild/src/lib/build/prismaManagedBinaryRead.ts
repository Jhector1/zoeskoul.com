import "server-only";
/** Trusted, owner-scoped read adapter. Never return an R2 key or stripped source. */
import type {PrismaClient} from "@zoeskoul/db";
import type {WorkspaceStateV2} from "@zoeskoul/learner-workspace/ide/types";
import {createZoeBuildPrivateR2ObjectStore} from "./cloudflareR2MediaServer";
import {createPrismaManagedBinaryPort} from "./prismaManagedBinaryPort";
import {managedBinaryReadsEnabled,resolveOwnedBuildWorkspace} from "./managedBinaryReadPolicy";

export function isManagedBinaryReadCutoverEnabled(): boolean {
  return managedBinaryReadsEnabled(process.env.ZOEBUILD_MANAGED_R2_READS);
}

/**
 * For legacy projects with the gate off, this is exactly the old validator.
 * When enabled, the current owner and exact version are rechecked by the
 * transaction port; immutable R2 bytes are verified before returning.
 * The private R2 secret file is NOT opened until a managed binding needs bytes.
 */
export async function readCanonicalOwnedBuildWorkspace(input: Readonly<{
  client: PrismaClient;
  ownerId: string;
  buildProjectId: string;
  sourceVersion: number;
  legacyWorkspace: unknown;
}>): Promise<WorkspaceStateV2> {
  const enabled = isManagedBinaryReadCutoverEnabled();
  return resolveOwnedBuildWorkspace({
    enabled,
    scope: {ownerId:input.ownerId,buildProjectId:input.buildProjectId},
    sourceVersion:input.sourceVersion,
    legacyWorkspace:input.legacyWorkspace,
    port: createPrismaManagedBinaryPort(input.client),
    readObject: async key => createZoeBuildPrivateR2ObjectStore().read(key),
  });
}
