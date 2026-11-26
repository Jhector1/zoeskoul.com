import "server-only";
import type { PrismaClient } from "@zoeskoul/db";
import { projectHostedRoutes } from "./hostedRouteProjection";
import { createHostedPublicDomain } from "./hostedPublicDomain";

export type HostedPublicRouteCandidate = Readonly<{
  domain: string;
  issuedAtMs: number;
  expiresAtMs: number;
  publicRoutes: Readonly<Record<string, Readonly<{
    canonicalHostname: string;
    projectId: string;
  }>>>;
}>;

/** Private development rehearsal only. Origins must come from trusted operator
 * configuration, never a request or project. The distinct candidate shape is
 * intentionally incompatible with the existing VM route snapshot protocol.
 * No alias implies an active deployment, authorization, DNS or public ingress.
 */
export async function projectHostedPublicRoutes(client: PrismaClient, input: Readonly<{
  projectIds: readonly string[];
  legacyProjectId: string;
  publicOrigin: string;
  controlOrigin: string;
}>): Promise<HostedPublicRouteCandidate> {
  const policy = createHostedPublicDomain(input.publicOrigin, input.controlOrigin);
  const snapshot = await projectHostedRoutes(client, {
    projectIds: input.projectIds,
    legacyProjectId: input.legacyProjectId,
  });
  const publicRoutes: Record<string, Readonly<{canonicalHostname: string; projectId: string}>> = Object.create(null);
  for (const [canonicalHostname, projectId] of Object.entries(snapshot.routes)) {
    const alias = policy.publicHostname(canonicalHostname);
    if (policy.canonicalHostname(alias) !== canonicalHostname || Object.hasOwn(publicRoutes, alias)) {
      throw new Error("INVALID_HOSTED_PUBLIC_ROUTE_ROW");
    }
    publicRoutes[alias] = Object.freeze({canonicalHostname, projectId});
  }
  // Translation must never renew an existing lease or return an expired one.
  const now = Date.now();
  if (now >= snapshot.expiresAtMs || now < snapshot.issuedAtMs) {
    throw new Error("HOSTED_ROUTE_READ_EXPIRED");
  }
  return Object.freeze({
    domain: policy.domain,
    issuedAtMs: snapshot.issuedAtMs,
    expiresAtMs: snapshot.expiresAtMs,
    publicRoutes: Object.freeze(publicRoutes),
  });
}
