import "server-only";

import { Prisma, type PrismaClient } from "@zoeskoul/db";

/** Project deletion must never silently discard payment records or leave remote resources. */
export type DeletionBlocker =
  | "BUILD_DELETE_ORDERS_PRESENT"
  | "BUILD_DELETE_EXTERNAL_CONNECTIONS"
  | "BUILD_DELETE_EXTERNAL_RESOURCES"
  | "BUILD_DELETE_ACTIVE_WORK";

export class BuildProjectDeleteBlockedError extends Error {
  constructor(readonly code: DeletionBlocker) {
    super(code);
    this.name = "BuildProjectDeleteBlockedError";
  }
}

export type DeletionSafety = Readonly<{
  orderCount: number;
  hasExternalConnections: boolean;
  hasExternalResources: boolean;
  hasActiveWork: boolean;
}>;

export function checkBuildProjectDeletion(safety: DeletionSafety): DeletionBlocker | null {
  if (safety.orderCount > 0) return "BUILD_DELETE_ORDERS_PRESENT";
  if (safety.hasExternalConnections) return "BUILD_DELETE_EXTERNAL_CONNECTIONS";
  if (safety.hasExternalResources) return "BUILD_DELETE_EXTERNAL_RESOURCES";
  if (safety.hasActiveWork) return "BUILD_DELETE_ACTIVE_WORK";
  return null;
}

/**
 * Delete the canonical CodeProject and its BuildProject in one transaction.
 * Cascading FKs remove revisions, grants, runs, artifacts, chats, native carts
 * and the empty native store; AI credit accounting is account-owned, not
 * project-owned, and must NOT be altered by project deletion.
 *
 * External assets or orders are never assumed deletable: require a separate
 * explicit reconciliation/retention workflow before allowing deletion.
 */
export async function deleteOwnedBuildProject(
  client: PrismaClient,
  input: Readonly<{ ownerId: string; buildProjectId: string; expectedTitle: string }>,
): Promise<"deleted" | "not-found" | "title-mismatch"> {
  if (!input.ownerId.trim() || !input.buildProjectId.trim() || !input.expectedTitle.trim()) {
    return "not-found";
  }

  return client.$transaction(async (tx) => {
    const project = await tx.buildProject.findFirst({
      where: { id: input.buildProjectId, codeProject: { ownerId: input.ownerId } },
      select: {
        id: true, codeProjectId: true, codeProject: { select: { title: true } },
        commerceStore: { select: {
          id: true, _count: { select: { orders: true } },
          providerConnections: { select: { provider: true, externalAccountRef: true,
            credentialsSecretRef: true, storefrontSecretRef: true, webhookSecretRef: true } },
        } },
        runs: { where: { status: { in: ["queued", "running"] } }, select: { id: true }, take: 1 },
        resources: { select: { providerRef: true, secretRef: true, status: true } },
        deployments: { select: { providerRef: true, status: true } },
      },
    });
    if (!project) return "not-found";
    if (project.codeProject.title !== input.expectedTitle) return "title-mismatch";

    const blocked = checkBuildProjectDeletion({
      orderCount: project.commerceStore?._count.orders ?? 0,
      hasExternalConnections: (project.commerceStore?.providerConnections ?? []).some(conn =>
        conn.provider !== "zoestore" || Boolean(conn.externalAccountRef || conn.credentialsSecretRef ||
          conn.storefrontSecretRef || conn.webhookSecretRef)),
      hasExternalResources: project.resources.some(resource =>
        resource.status !== "deleted" && (Boolean(resource.providerRef || resource.secretRef) ||
          ["requested", "provisioning", "ready", "deleting"].includes(resource.status))) ||
        project.deployments.some(deployment => Boolean(deployment.providerRef)),
      hasActiveWork: project.runs.length > 0 || project.deployments.some(deployment =>
        ["queued", "building", "deploying"].includes(deployment.status)),
    });
    if (blocked) throw new BuildProjectDeleteBlockedError(blocked);

    // Provider-route FK references connection with RESTRICT: delete routes
    // before cascading the native store/connection rows.
    if (project.commerceStore) {
      await tx.commerceProviderRoute.deleteMany({ where: { storeId: project.commerceStore.id } });
      await tx.commerceCartItem.deleteMany({ where: { cart: { storeId: project.commerceStore.id } } });
    }
    const deletion = await tx.codeProject.deleteMany({
      where: { id: project.codeProjectId, ownerId: input.ownerId },
    });
    if (deletion.count !== 1) throw new Error("BUILD_DELETE_CONCURRENT_CHANGE");
    return "deleted";
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
