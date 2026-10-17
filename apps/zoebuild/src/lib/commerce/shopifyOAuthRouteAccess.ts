import "server-only";

import { getBuildProjectCommand } from "@zoeskoul/build-application";
import type { PrismaClient } from "@zoeskoul/db";
import { loadCurrentBuildAccessSnapshot } from "@/lib/build/currentBuildAccess";
import { createPrismaBuildProjectReader } from "@/lib/build/readBuildProjects";

export class ShopifyOAuthRouteAccessError extends Error {
  constructor(readonly status: 401 | 404) {
    super("Shopify connection project is unavailable.");
    this.name = "ShopifyOAuthRouteAccessError";
  }
}

/** Reuses the Web-owned session and the canonical Build owner access check. */
export async function requireShopifyOAuthOwnedStore(
  client: PrismaClient,
  request: Request,
  buildProjectId: string,
): Promise<string> {
  if (!buildProjectId.trim()) throw new ShopifyOAuthRouteAccessError(404);
  const access = await loadCurrentBuildAccessSnapshot(request);
  if (!access.userId) throw new ShopifyOAuthRouteAccessError(401);
  let project: unknown;
  try {
    project = await getBuildProjectCommand({
      access,
      buildProjectId,
      reader: createPrismaBuildProjectReader(client),
    });
  } catch {
    throw new ShopifyOAuthRouteAccessError(404);
  }
  if (!project) throw new ShopifyOAuthRouteAccessError(404);
  const store = await client.commerceStore.findUnique({
    where: { buildProjectId },
    select: { id: true },
  });
  if (!store) throw new ShopifyOAuthRouteAccessError(404);
  return store.id;
}
