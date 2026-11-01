import "server-only";
import {prisma} from "@zoeskoul/platform-server/prisma";
import {COMMERCE_PROVIDER_DEFINITIONS} from "@/lib/commerce/commerceProviderCatalog";
import {supportsCommerceProviderExecutionForEnvironments} from "@/lib/commerce/commerceRuntimeRegistry";
import {COMMERCE_PROVIDER_CAPABILITIES} from "@/lib/commerce/nativeCommerceProvider";
import {isZoeBuildPublishEnabled} from "./publishOrigins";
import {buildZoeCapabilityEvidence} from "./zoeCapabilityEvidence";

/** Owner authorization MUST occur in the calling route before this function.
 * Reads only connection *status*, never private tokens or secret references.
 * A failed read is reported as unknown, not a disconnected account.
 */
export async function resolveZoeCapabilityReality(input: Readonly<{
  buildProjectId: string;
  project: Readonly<{stackId: string|null; status: string; sourceVersion: number}>;
  aiEditAllowed: boolean;
}>) {
  let commerceLookup: "loaded" | "failed" = "loaded";
  let store: Awaited<ReturnType<typeof readCommerceStatus>> = null;
  try {
    store = await readCommerceStatus(input.buildProjectId);
  } catch (error) {
    commerceLookup = "failed";
    console.warn("[ZoeBuild capability reality] commerce connection status unavailable", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
  }
  const runtimeProviders = COMMERCE_PROVIDER_DEFINITIONS.map(provider => ({
    id: provider.id, connectionRequired: provider.connectionRequired,
    executableCapabilities: COMMERCE_PROVIDER_CAPABILITIES.filter(capability =>
      supportsCommerceProviderExecutionForEnvironments(
        provider.id, capability, provider.environments)),
  }));
  return buildZoeCapabilityEvidence({
    project: input.project, aiEditAllowed: input.aiEditAllowed,
    publishEnabled: isZoeBuildPublishEnabled(),
    commerceLookup, commerceStorePresent: Boolean(store),
    connections: store?.providerConnections ?? [],
    routes: (store?.providerRoutes ?? []).map(route => ({
      provider: route.provider, environment: route.environment,
      capability: route.capability, connected: route.connection?.status === "active",
    })),
    runtimeProviders,
  });
}

function readCommerceStatus(buildProjectId: string) {
  return prisma.commerceStore.findUnique({
    where: {buildProjectId},
    select: {
      providerConnections: {select: {provider: true, environment: true, status: true}},
      providerRoutes: {select: {provider: true, environment: true, capability: true,
        connection: {select: {status: true}}}},
    },
  });
}
