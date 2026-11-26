import "server-only";
import type { PrismaClient } from "@zoeskoul/db";
import { hostedHostnamePolicyEnabled, isValidReservation } from "./hostedHostname";

const ID = /^[A-Za-z0-9_-]{4,128}$/;
const MAX_PROJECTS = 2; // Same development capacity as hosted_control.py.
export const HOSTED_ROUTE_LEASE_MS = 30_000;
export type HostedRouteSnapshot = Readonly<{issuedAtMs: number; expiresAtMs: number; routes: Readonly<Record<string, string>>}>;

/** Private operator scope only. Not a browser API or a publishing operation.
 * A reservation is not evidence of an active deployment. The VM independently
 * checks its allowlist and active release on every request.
 */
export async function projectHostedRoutes(client: PrismaClient, input: Readonly<{
  projectIds: readonly string[]; legacyProjectId: string;
}>): Promise<HostedRouteSnapshot> {
  if (!hostedHostnamePolicyEnabled() || process.env.ZOEBUILD_HOSTED_DATABASE_ROUTES_ENABLED !== "1") {
    throw new Error("HOSTED_ROUTES_DISABLED");
  }
  const ids = [...input.projectIds];
  if (!ID.test(input.legacyProjectId) || ids.length < 1 || ids.length > MAX_PROJECTS
      || ids.some(id => !ID.test(id) || id === input.legacyProjectId) || new Set(ids).size !== ids.length) {
    throw new Error("INVALID_HOSTED_ROUTE_SCOPE");
  }
  // Start the lease BEFORE reading, so slow queries cannot extend stale data.
  const issuedAtMs = Date.now();
  const rows = await client.$transaction(tx => tx.buildProject.findMany({
    where: {id: {in: ids}, status: {not: "archived"}, stackId: "tanstack-start-v1", codeProject: {archivedAt: null}},
    select: {id: true, hostedHostname: {select: {hostname: true}}},
  }), {isolationLevel: "RepeatableRead"});
  const routes: Record<string, string> = Object.create(null);
  const seen = new Set<string>();
  for (const row of rows) {
    if (!ids.includes(row.id) || seen.has(row.id)) throw new Error("INVALID_HOSTED_ROUTE_ROW");
    seen.add(row.id);
    if (!row.hostedHostname) continue;
    const hostname = row.hostedHostname.hostname;
    if (!isValidReservation(hostname) || Object.hasOwn(routes, hostname)) throw new Error("INVALID_HOSTED_ROUTE_ROW");
    routes[hostname] = row.id;
  }
  const expiresAtMs = issuedAtMs + HOSTED_ROUTE_LEASE_MS;
  if (Date.now() >= expiresAtMs || Date.now() < issuedAtMs) throw new Error("HOSTED_ROUTE_READ_EXPIRED");
  return {issuedAtMs, expiresAtMs, routes};
}
