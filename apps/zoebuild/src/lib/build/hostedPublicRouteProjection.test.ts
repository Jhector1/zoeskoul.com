import assert from "node:assert/strict";
import type { PrismaClient } from "@zoeskoul/db";
import { afterEach, beforeEach, test, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { HOSTED_ROUTE_LEASE_MS, projectHostedRoutes } from "./hostedRouteProjection";
import { projectHostedPublicRoutes } from "./hostedPublicRouteProjection";

const scope = {projectIds: ["proj_blue", "proj_snake"], legacyProjectId: "proj_legacy"};
const input = {...scope, publicOrigin: "https://zoebuild.site", controlOrigin: "https://build.zoeskoul.com"};
const row = (id: string, hostname: string | null) => ({id, hostedHostname: hostname === null ? null : {hostname}});
const blue = "blue-gallery.sites.zoebuild.test";
const snake = "snake-game.sites.zoebuild.test";

function fixture(rows: ReturnType<typeof row>[]) {
  const findMany = vi.fn(async (_query: unknown) => rows);
  const transaction = vi.fn(async (fn: (tx: {buildProject: {findMany: typeof findMany}}) => Promise<unknown>, _options: unknown) =>
    fn({buildProject: {findMany}}));
  return {client: {$transaction: transaction} as unknown as PrismaClient, findMany, transaction};
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("VERCEL_ENV", "development");
  vi.stubEnv("ZOEBUILD_PUBLISH_ENABLED", "0");
  vi.stubEnv("ZOEBUILD_HOSTED_HOSTNAMES_ENABLED", "1");
  vi.stubEnv("ZOEBUILD_HOSTED_DATABASE_ROUTES_ENABLED", "1");
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

test("projects public aliases and canonical identity from one read without changing the lease", async () => {
  vi.spyOn(Date, "now").mockReturnValue(100_000);
  const f = fixture([row("proj_blue", blue), row("proj_snake", snake)]);
  const result = await projectHostedPublicRoutes(f.client, input);
  assert.equal(result.domain, "zoebuild.site");
  assert.equal(result.issuedAtMs, 100_000);
  assert.equal(result.expiresAtMs, 100_000 + HOSTED_ROUTE_LEASE_MS);
  assert.deepEqual({...result.publicRoutes}, {
    "blue-gallery.zoebuild.site": {canonicalHostname: blue, projectId: "proj_blue"},
    "snake-game.zoebuild.site": {canonicalHostname: snake, projectId: "proj_snake"},
  });
  assert.equal(Object.hasOwn(result, "routes"), false);
  assert.equal(Object.getPrototypeOf(result.publicRoutes), null);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.publicRoutes), true);
  assert.equal(Object.isFrozen(result.publicRoutes["blue-gallery.zoebuild.site"]), true);
  assert.equal(f.transaction.mock.calls.length, 1);
  assert.deepEqual(f.transaction.mock.calls[0]?.[1], {isolationLevel: "RepeatableRead"});
  assert.deepEqual(f.findMany.mock.calls[0]?.[0], {
    where: {id: {in: scope.projectIds}, status: {not: "archived"}, stackId: "tanstack-start-v1", codeProject: {archivedAt: null}},
    select: {id: true, hostedHostname: {select: {hostname: true}}},
  });
});

test("keeps the canonical snapshot contract unchanged", async () => {
  const f = fixture([row("proj_blue", blue)]);
  const result = await projectHostedRoutes(f.client, scope);
  assert.deepEqual(Object.keys(result).sort(), ["expiresAtMs", "issuedAtMs", "routes"]);
  assert.deepEqual({...result.routes}, {[blue]: "proj_blue"});
});

test("uses an explicit alternative domain and preserves generated reservations", async () => {
  const hostname = "site-" + "a".repeat(24) + ".sites.zoebuild.test";
  const f = fixture([row("proj_blue", hostname), row("proj_snake", null)]);
  const result = await projectHostedPublicRoutes(f.client, {...input, publicOrigin: "https://example.dev"});
  assert.deepEqual({...result.publicRoutes}, {
    ["site-" + "a".repeat(24) + ".example.dev"]: {canonicalHostname: hostname, projectId: "proj_blue"},
  });
  const empty = await projectHostedPublicRoutes(fixture([]).client, input);
  assert.deepEqual(Object.keys(empty.publicRoutes), []);
});

test("rejects invalid or overlapping domains before database access", async () => {
  const f = fixture([]);
  for (const publicOrigin of ["", "http://zoebuild.site", "https://zoeskoul.com", "https://zoebuild.site:443"]) {
    await assert.rejects(projectHostedPublicRoutes(f.client, {...input, publicOrigin}), /INVALID_HOSTED_PUBLIC_DOMAIN/);
  }
  assert.equal(f.transaction.mock.calls.length, 0);
});

test("does not bypass development gates or project scope", async () => {
  const f = fixture([]);
  for (const projectIds of [[], ["proj_legacy"], ["proj_blue", "proj_blue"], ["proj_blue", "proj_snake", "proj_third"]]) {
    await assert.rejects(projectHostedPublicRoutes(f.client, {...input, projectIds}), /INVALID_HOSTED_ROUTE_SCOPE/);
  }
  vi.stubEnv("ZOEBUILD_HOSTED_DATABASE_ROUTES_ENABLED", "0");
  await assert.rejects(projectHostedPublicRoutes(f.client, input), /HOSTED_ROUTES_DISABLED/);
  vi.stubEnv("ZOEBUILD_HOSTED_DATABASE_ROUTES_ENABLED", "1");
  vi.stubEnv("NODE_ENV", "production");
  await assert.rejects(projectHostedPublicRoutes(f.client, input), /HOSTED_ROUTES_DISABLED/);
  assert.equal(f.transaction.mock.calls.length, 0);
});

test("fails closed on unexpected, duplicate or malformed reservation rows", async () => {
  for (const rows of [
    [row("proj_other", blue)],
    [row("proj_blue", blue), row("proj_blue", snake)],
    [row("proj_blue", blue), row("proj_snake", blue)],
    [row("proj_blue", "admin.sites.zoebuild.test")],
    [row("proj_blue", "blue-gallery.zoebuild.site")],
  ]) {
    await assert.rejects(projectHostedPublicRoutes(fixture(rows).client, input), /INVALID_HOSTED_ROUTE_ROW/);
  }
});

test("rejects expired reads, expired translation and backwards time without renewing the lease", async () => {
  const f = fixture([row("proj_blue", blue)]);
  const clock = vi.spyOn(Date, "now").mockReturnValue(130_000);
  clock.mockReturnValueOnce(100_000);
  await assert.rejects(projectHostedPublicRoutes(f.client, input), /HOSTED_ROUTE_READ_EXPIRED/);
  clock.mockReset().mockReturnValue(130_000);
  clock.mockReturnValueOnce(100_000).mockReturnValueOnce(129_999).mockReturnValueOnce(129_999);
  await assert.rejects(projectHostedPublicRoutes(f.client, input), /HOSTED_ROUTE_READ_EXPIRED/);
  clock.mockReset().mockReturnValue(99_999);
  clock.mockReturnValueOnce(100_000);
  await assert.rejects(projectHostedPublicRoutes(f.client, input), /HOSTED_ROUTE_READ_EXPIRED/);
});
