import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repo = resolve(process.cwd(), "../..");
const read = (p: string) =>
  readFileSync(resolve(repo, p), "utf8");

describe("provider platform commerce foundation", () => {
  it("requires explicit route connections", () => {
    const schema = read("packages/db/prisma/schema.prisma");
    expect(schema).toContain("connectionId String");
    expect(schema).not.toContain("connectionId String?");
    expect(schema).toContain(
      "connection   CommerceProviderConnection @relation",
    );
  });

  it("uses ZoeStore without a native connection exception", () => {
    const provider = read(
      "apps/zoebuild/src/lib/commerce/nativeCommerceProvider.ts",
    );
    const resolver = read(
      "apps/zoebuild/src/lib/commerce/commerceProviderResolver.ts",
    );
    expect(provider).toContain('"zoestore"');
    expect(provider).toContain("zoeStoreCommerceProviderRoutes");
    expect(resolver).not.toContain("connectionRequired");
    expect(resolver).not.toContain("ZOEBUILD_NATIVE");
  });

  it("backfills explicit ZoeStore connections", () => {
    const migration = read(
      "packages/db/prisma/migrations/20261017161500_zoestore_explicit_provider_connections/migration.sql",
    );
    expect(migration).toContain("'zoebuild-native'");
    expect(migration).toContain("'zoestore'");
    expect(migration).toContain(
      'ALTER COLUMN "connectionId" SET NOT NULL',
    );
  });
});
