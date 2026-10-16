import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function read(relative: string) {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

describe("Build AI subscription grant ownership", () => {
  it("projects FeatureGrant only after canonical subscription persistence", () => {
    const source = read("./stripeService.ts");

    const upsertAt = source.indexOf("await prisma.subscription.upsert({");
    const grantAt = source.indexOf(
      "await reconcileBuildAiSubscriptionGrantForUser(user.id);",
    );

    expect(upsertAt).toBeGreaterThanOrEqual(0);
    expect(grantAt).toBeGreaterThan(upsertAt);
    expect(source).toContain(
      "await reconcileBuildAiSubscriptionGrantForUser(userId);",
    );
  });

  it("revokes the projection after a Stripe customer is deleted", () => {
    const source = read("./stripeWebhookReconciliation.ts");

    const cancelAt = source.indexOf('status: "canceled"');
    const reconcileAt = source.indexOf(
      "await reconcileBuildAiSubscriptionGrantForUser(user.id);",
    );

    expect(source).toContain("const affectedUsers = await prisma.user.findMany");
    expect(cancelAt).toBeGreaterThanOrEqual(0);
    expect(reconcileAt).toBeGreaterThan(cancelAt);
  });

  it("keeps ZoeBuild out of Stripe and subscription mutation", () => {
    const source = read(
      "../../../../zoebuild/src/lib/build/buildAccessSnapshot.ts",
    ).toLowerCase();

    expect(source).not.toContain("getstripe");
    expect(source).not.toContain("subscription.find");
    expect(source).not.toContain("subscription.upsert");
  });
});
