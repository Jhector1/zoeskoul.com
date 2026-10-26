import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
function read(relative: string) {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}
describe("Builder AI billing ownership", () => {
  it("reconciles permissions only after canonical Stripe persistence", () => {
    const source = read("./stripeService.ts");
    expect(source.indexOf("await prisma.subscription.upsert({")).toBeGreaterThanOrEqual(0);
    expect(source.indexOf("await reconcileBuilderAiBillingForUser(user.id);")).toBeGreaterThan(
      source.indexOf("await prisma.subscription.upsert({"),
    );
    expect(source).toContain("await reconcileBuilderAiBillingForUser(userId);");
  });
  it("revokes subscription grants after customer deletion", () => {
    const source = read("./stripeWebhookReconciliation.ts");
    expect(source.indexOf("await reconcileBuilderAiBillingForUser(user.id);")).toBeGreaterThan(
      source.indexOf('status: "canceled"'),
    );
  });
  it("maintains the sole Builder AI billing projector", () => {
    const source = read("./reconcileBuilderAiBillingForUser.ts");
    expect(source).toContain("reconcileBuilderAiSubscriptionGrants(");
    expect(source).toContain("resolvePlatformBillingCatalog(process.env)");
    expect(source).not.toContain("FeatureKey.build_ai_generate");
  });
});
