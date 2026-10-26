/**
 * V12J.5B: read-only ZoeBuild consumers of subscriptions and grants persisted
 * by the Web signed-webhook test in the SAME verified development database.
 * The authentication snapshot and external Stripe lifecycle are simulated;
 * database queries and actual ZoeBuild GET handlers are real.
 * NOT live Stripe delivery, browser authentication, or AI-spend activation.
 */
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { FeatureKey } from "@zoeskoul/db";
import { prisma } from "@zoeskoul/platform-server/prisma";
const mocks = vi.hoisted(() => ({ access: vi.fn(), live: vi.fn(), recover: vi.fn(), checkout: vi.fn() }));
vi.mock("@/lib/build/currentBuildAccess", () => ({ loadCurrentBuildAccessSnapshot: mocks.access }));
vi.mock("@/lib/billing/platformStripeProvider", () => ({
  readBuilderStripeLifecycle: mocks.live,
  recoverVerifiedBuilderCheckoutForSubscription: mocks.recover,
  verifyBuilderPlatformCheckoutReturn: mocks.checkout,
}));
import { GET as getStatus } from "../../app/api/billing/status/route";
import { GET as getVerification } from "../../app/api/billing/verification/route";
const enabled = process.env.BILLING_ACCEPTANCE_RUN === "V12J5_VERIFIED_DEVELOPMENT_DATABASE" &&
  process.env.BILLING_CROSSAPP_ACCEPTANCE_RUN === "V12J5B_VERIFIED_DEVELOPMENT_DATABASE" &&
  !!process.env.BILLING_CROSSAPP_STAGE;

describe.runIf(enabled)("V12J.5B real PostgreSQL -> ZoeBuild billing consumers", () => {
  let userId = "";
  let subscriptionId = "";
  let stage = "";
  const req = (which: string) => new Request(`https://zoebuild.test/api/billing/${which}`);

  beforeAll(async () => {
    const { preflightBillingDevelopmentDatabase, selectedDevDatabaseUrl } = await import(
      "../../../../../packages/db/scripts/billing-postgres-dev-preflight.mjs");
    const raw = selectedDevDatabaseUrl();
    const checked = await preflightBillingDevelopmentDatabase(raw);
    if (!raw || !checked.ok) throw Error("BILLING_CROSSAPP_PREFLIGHT_FAILED");
    const [identity] = await prisma.$queryRaw<Array<{
      database: string; db_role: string; server_address: string | null;
      server_port: number | null; server_started_at: string;
    }>>`
      SELECT current_database() AS database, current_user AS db_role,
        inet_server_addr()::text AS server_address, inet_server_port() AS server_port,
        pg_postmaster_start_time()::text AS server_started_at
    `;
    if (identity?.database !== checked.database || identity.db_role !== checked.role ||
      identity.server_address !== checked.serverAddress || identity.server_port !== checked.serverPort ||
      identity.server_started_at !== checked.serverStartedAt) {
      throw Error("BILLING_CROSSAPP_PRISMA_TARGET_MISMATCH");
    }
    userId = process.env.BILLING_CROSSAPP_USER_ID ?? "";
    subscriptionId = process.env.BILLING_CROSSAPP_SUBSCRIPTION_ID ?? "";
    stage = process.env.BILLING_CROSSAPP_STAGE ?? "";
    if (!/^pg-billing-[0-9a-f-]{36}$/.test(userId) ||
      !/^sub_v12j5_[0-9a-f]{32}$/.test(subscriptionId) ||
      !["active", "scheduled", "renewed", "canceled"].includes(stage)) {
      throw Error("BILLING_CROSSAPP_FIXTURE_ID_OR_STAGE_NOT_APPROVED");
    }
    const subscription = await prisma.subscription.findUnique({
      where: { stripeSubscriptionId: subscriptionId },
    });
    if (subscription?.userId !== userId || subscription.billingProduct !== "builder_ai") {
      throw Error("BILLING_CROSSAPP_FIXTURE_OWNER_MISMATCH");
    }
    // Simulated authentication, but effective entitlements come from REAL
    // persisted feature grants, not a hardcoded positive result.
    mocks.access.mockImplementation(async () => {
      const grants = await prisma.featureGrant.findMany({ where: {
        userId, type: "subscription", revokedAt: null,
        feature: { in: [FeatureKey.build_ai_generate, FeatureKey.build_ai_edit] },
      } });
      const now = new Date();
      return { userId, entitlements: grants.filter(g =>
        (!g.startsAt || g.startsAt <= now) && (!g.endsAt || g.endsAt > now),
      ).map(g => g.feature) };
    });
    mocks.live.mockImplementation(async (customerId: string) => {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { stripeCustomerId: true } });
      if (!user?.stripeCustomerId || customerId !== user.stripeCustomerId || stage === "canceled") return null;
      const row = await prisma.subscription.findUnique({ where: { stripeSubscriptionId: subscriptionId } });
      if (!row || row.status !== "active" || row.userId !== userId || row.stripeCustomerId !== customerId) return null;
      // Simulated current Stripe response corresponding to the signed-webhook
      // stage; independent absence and foreign mismatches are tested below.
      return { subscriptionId, status: "active", periodEnd: row.currentPeriodEnd?.toISOString() ?? null,
        cancelAt: row.cancelAtPeriodEnd ? row.currentPeriodEnd?.toISOString() ?? null : null,
        cancelAtPeriodEnd: row.cancelAtPeriodEnd,
        nextBillingDate: null, nextBillingAmountMinor: null, nextBillingCurrency: null };
    });
    mocks.recover.mockResolvedValue(false);
    mocks.checkout.mockResolvedValue({ state: "invalid", subscriptionId: null });
  }, 30000);
  afterAll(async () => { await prisma.$disconnect(); }, 15000);

  it("reads the persisted subscription owner, lifecycle and grants without leaking IDs", async () => {
    const active = stage !== "canceled";
    const scheduled = stage === "scheduled";
    const status = await getStatus(req("status"));
    const verification = await getVerification(req("verification"));
    expect(status.status).toBe(200);
    expect(verification.status).toBe(200);
    const a = await status.json();
    const b = await verification.json();
    expect(a).toMatchObject({ product: "builder_ai", subscribed: active,
      cancelAtPeriodEnd: active && scheduled });
    expect(b).toMatchObject({ subscriptionActive: active, generateGrant: active,
      editGrant: active, cancelAtPeriodEnd: active && scheduled,
      webhookProcessed: active });
    expect(b.checkoutReturn).toBe("not_checked");
    const [user, rows, grants] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.subscription.findMany({ where: { userId } }),
      prisma.featureGrant.findMany({ where: { userId, type: "subscription", revokedAt: null } }),
    ]);
    expect(user?.stripeCustomerId).toBeTruthy();
    expect(rows.some(r => r.stripeSubscriptionId === subscriptionId && r.billingProduct === "builder_ai")).toBe(true);
    // Learning is separately funded. Check the same user’s Learning row but
    // never interpret it as a Builder AI grant or subscription.
    const expectedLearning = process.env.BILLING_CROSSAPP_EXPECT_LEARNING === "true";
    const learning = rows.find(r => r.billingProduct === "learning");
    const learningEligible = Boolean(learning && learning.status === "active" &&
      learning.currentPeriodEnd && learning.currentPeriodEnd > new Date());
    expect(learningEligible).toBe(expectedLearning);
    const now = new Date();
    expect(grants.filter(g => (g.feature === FeatureKey.build_ai_generate || g.feature === FeatureKey.build_ai_edit) &&
      (!g.endsAt || g.endsAt > now))).toHaveLength(active ? 2 : 0);
    for (const value of [user!.stripeCustomerId!, subscriptionId]) {
      expect(JSON.stringify(a)).not.toContain(value);
      expect(JSON.stringify(b)).not.toContain(value);
    }
    console.log(`BILLING_CROSSAPP_DB_CONSUMERS_PASS stage=${stage} active=${active} writes=NO`);
  }, 30000);

  it("denies absent or foreign provider state despite a recorded subscription", async () => {
    const saved = mocks.live.getMockImplementation();
    try {
      mocks.live.mockResolvedValue(null);
      expect((await (await getStatus(req("status"))).json()).subscribed).toBe(false);
      expect(await (await getVerification(req("verification"))).json()).toMatchObject({
        subscriptionActive: false, generateGrant: false, editGrant: false,
      });
      mocks.live.mockResolvedValue({ subscriptionId: "sub_foreign", status: "active",
        periodEnd: "2100-01-01T00:00:00Z", cancelAt: null, cancelAtPeriodEnd: false,
        nextBillingDate: null, nextBillingAmountMinor: null, nextBillingCurrency: null });
      expect((await (await getStatus(req("status"))).json()).subscribed).toBe(false);
      expect(await (await getVerification(req("verification"))).json()).toMatchObject({
        subscriptionActive: false, generateGrant: false, editGrant: false,
      });
    } finally { if (saved) mocks.live.mockImplementation(saved); }
  }, 30000);

  it("rejects missing authentication and another user's account", async () => {
    mocks.access.mockResolvedValueOnce({ userId: null, entitlements: [] });
    expect((await getStatus(req("status"))).status).toBe(401);
    mocks.access.mockResolvedValueOnce({ userId: null, entitlements: [] });
    expect((await getVerification(req("verification"))).status).toBe(401);
    const foreign = `pg-billing-${"0".repeat(36)}`;
    mocks.access.mockResolvedValueOnce({ userId: foreign, entitlements: ["build_ai_generate", "build_ai_edit"] });
    expect((await (await getStatus(req("status"))).json()).subscribed).toBe(false);
    mocks.access.mockResolvedValueOnce({ userId: foreign, entitlements: ["build_ai_generate", "build_ai_edit"] });
    expect(await (await getVerification(req("verification"))).json()).toMatchObject({
      subscriptionActive: false, generateGrant: false, editGrant: false,
    });
  }, 30000);
});
