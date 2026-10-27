import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function read(relative: string) {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

describe("ZoeBuild create-project command boundary", () => {
  it("keeps transport abuse/auth/spec validation ahead of persistence", () => {
    const source = read("./route.ts");

    expect(source).toContain("enforceSameOriginPost(req)");
    expect(source).toContain("exceedsContentLength(req, MAX_CREATE_BUILD_BODY_BYTES)");
    expect(source).toContain("loadCurrentBuildAccessSnapshot()");
    expect(source).toContain("rateLimit(`zoebuild-create:${userId}`");
    expect(source).toContain("parseProjectSpecification(body.specification)");
    expect(source).toContain("const userId = access.userId ?? \"\";");
    expect(source).toContain("createBuildProjectCommand({");
    expect(source).toContain("createPrismaBuildProjectPersistence(prisma)");

    expect(source).not.toContain("createPersistedBuildProject(");
    expect(source).not.toContain("prisma.buildProject.create");
    expect(source).not.toContain("prisma.codeProject.create");
  });

  it("keeps provider credentials and paid infrastructure out of the create route", () => {
    const source = read("./route.ts").toLowerCase();

    expect(source).not.toContain("cloudflare");
    expect(source).not.toContain("neon");
    expect(source).not.toContain("stripe");
    expect(source).not.toContain("docker");
    expect(source).not.toContain("openai");
  });

  it("loads paid AI entitlement only from the canonical FeatureGrant seam", () => {
    const source = read("../../../../lib/build/buildAccessSnapshot.ts");

    expect(source).toContain('import "server-only"');
    expect(source).toContain('from "@zoeskoul/platform-server/prisma"');
    expect(source).toContain("prisma.featureGrant.findMany");
    expect(source).toContain("FeatureKey.build_ai_generate");
    expect(source).toContain("userId: normalizedUserId");
    expect(source).toContain("revokedAt: null");
    expect(source).toContain("startsAt: true");
    expect(source).toContain("endsAt: true");
    expect(source).toContain("FeatureKey.build_ai_edit");
    expect(source).toContain("for (const feature of eligibleFeatures)");
    expect(source).toContain("entitlements.push(feature)");
    expect(source).toContain("isWithinGrantWindow(now, grant.startsAt, grant.endsAt)");
    expect(source).not.toContain("stripe");
    expect(source).not.toContain("ZOEBUILD_DEV");
  });
});
