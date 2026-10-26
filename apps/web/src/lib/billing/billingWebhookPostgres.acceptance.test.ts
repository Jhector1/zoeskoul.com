/**
 * V12J.5A: signed Stripe webhook -> real PostgreSQL event ledger -> canonical
 * subscription persistence -> Builder AI grant activation/revocation.
 *
 * Only explicitly authorized development DB; no external Stripe calls.
 * A real Stripe SDK verifies HMAC, but provider subscription responses are
 * deliberately simulated. Not evidence of live Stripe delivery or UI auth.
 *
 * Synthetic fixtures are retained in the confirmed development database.
 */
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import type { PrismaClient } from "@zoeskoul/db";

vi.mock("server-only", () => ({}));
const provider = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/lib/stripe", () => ({ getStripe: () => provider.current }));

const APPROVAL = "V12J5_VERIFIED_DEVELOPMENT_DATABASE";
const enabled = process.env.BILLING_ACCEPTANCE_RUN === APPROVAL;
const prefix = `v12j5_${randomUUID().replace(/-/g, "")}`;

type WebhookRoute = typeof import("../../app/api/stripe/webhook/route");
type WebhookResult = { status: number; body: Record<string, unknown> };

// Ordinary Vitest runs cannot create any database test fixture.
describe.runIf(enabled)("V12J.5A signed webhook -> real PostgreSQL subscription and grants", () => {
  let db: PrismaClient;
  let route: WebhookRoute;
  let stripe: Stripe;
  let preflightOk = false;
  let fixtureCreated = false;
  let subscription: Stripe.Subscription;
  let failNextRetrieve = false;
  let webhookSecret: string;
  const userId = `pg-billing-${randomUUID()}`;
  const customerId = `cus_${prefix}`;
  const subscriptionId = `sub_${prefix}`;
  const priceId = `price_${prefix}`;
  const productId = `prod_${prefix}`;
  const learningSubscriptionId = `sub_learning_${prefix}`;
  const learningPriceId = `price_learning_${prefix}`;
  let learningSubscription: Stripe.Subscription | null = null;
  const eventIds: string[] = [];
  const future = (days: number) => Math.floor(Date.now() / 1000) + days * 86400;

  function currentSubscription(status: Stripe.Subscription.Status, options: {
    customerId?: string;
    periodDays?: number;
    cancelAtPeriodEnd?: boolean;
  } = {}): Stripe.Subscription {
    const end = future(options.periodDays ?? 30);
    return {
      id: subscriptionId,
      object: "subscription",
      customer: options.customerId ?? customerId,
      status,
      livemode: false,
      cancel_at_period_end: options.cancelAtPeriodEnd ?? false,
      trial_end: null,
      metadata: { userId, billingProduct: "builder_ai" },
      items: { data: [{
        id: `si_${prefix}`,
        current_period_end: end,
        price: { id: priceId, product: productId },
      }] },
    } as unknown as Stripe.Subscription;
  }

  function currentLearningSubscription(status: Stripe.Subscription.Status, options: {
    periodDays?: number; cancelAtPeriodEnd?: boolean;
  } = {}): Stripe.Subscription {
    const end = future(options.periodDays ?? 30);
    return {
      id: learningSubscriptionId, object: "subscription", customer: customerId,
      status, livemode: false, cancel_at_period_end: options.cancelAtPeriodEnd ?? false,
      trial_end: null, metadata: { userId, billingProduct: "learning" },
      items: { data: [{ id: `si_learning_${prefix}`, current_period_end: end,
        price: { id: learningPriceId, product: `prod_learning_${prefix}` } }] },
    } as unknown as Stripe.Subscription;
  }

  function makeEvent(type: string, options: {
    id?: string;
    livemode?: boolean;
    staleStatus?: string;
    subscriptionId?: string;
  } = {}): Stripe.Event {
    const id = options.id ?? `evt_${prefix}_${randomUUID().replace(/-/g, "")}`;
    eventIds.push(id);
    const isInvoice = type.startsWith("invoice.");
    const targetId = options.subscriptionId ?? subscriptionId;
    const current = targetId === learningSubscriptionId ? learningSubscription : subscription;
    return {
      id, object: "event", api_version: null, created: Math.floor(Date.now() / 1000),
      livemode: options.livemode ?? false,
      pending_webhooks: 0, request: null, type,
      data: { object: isInvoice
        ? { id: `in_${prefix}`, object: "invoice", customer: customerId,
            parent: { subscription_details: { subscription: targetId } } }
        : { id: targetId, object: "subscription", customer: customerId,
            status: options.staleStatus ?? current?.status,
            metadata: { userId, billingProduct: targetId === learningSubscriptionId ? "learning" : "builder_ai" } },
      },
    } as unknown as Stripe.Event;
  }

  async function postSigned(event: Stripe.Event, options: { tamper?: boolean } = {}): Promise<WebhookResult> {
    const payload = JSON.stringify(event);
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: webhookSecret });
    const request = new Request("http://localhost:3000/api/stripe/webhook", {
      method: "POST", headers: { "stripe-signature": signature },
      body: options.tamper ? `${payload} ` : payload,
    });
    const response = await route.POST(request);
    return { status: response.status, body: await response.json() as Record<string, unknown> };
  }

  async function storedSubscription() {
    return db.subscription.findUnique({ where: { stripeSubscriptionId: subscriptionId } });
  }

  async function activeGrants() {
    const now = new Date();
    const grants = await db.featureGrant.findMany({ where: {
      userId, type: "subscription", revokedAt: null,
    } });
    return grants.filter(g => ["build_ai_generate", "build_ai_edit"].includes(g.feature) &&
      (!g.startsAt || g.startsAt <= now) && (!g.endsAt || g.endsAt > now));
  }

  async function expectProcessed(event: Stripe.Event, expectedId = subscriptionId) {
    const result = await postSigned(event);
    expect(result, JSON.stringify(result)).toMatchObject({
      status: 200, body: { outcome: "processed" },
    });
    const record = await db.stripeEvent.findUnique({ where: { id: event.id } });
    expect(record).toMatchObject({ status: "processed", subscriptionId: expectedId });
    return record;
  }

  beforeAll(async () => {
    if (process.env.BILLING_ACCEPTANCE_RUN !== APPROVAL) {
      throw Error("BILLING_ACCEPTANCE_EXPLICIT_APPROVAL_REQUIRED");
    }
    const { preflightBillingDevelopmentDatabase, selectedDevDatabaseUrl } = await import(
      "../../../../../packages/db/scripts/billing-postgres-dev-preflight.mjs"
    );
    const candidate = selectedDevDatabaseUrl();
    const checked = await preflightBillingDevelopmentDatabase(candidate);
    if (!candidate || !checked.ok) throw Error("BILLING_ACCEPTANCE_PREFLIGHT_FAILED");

    // Never initialize app Prisma until the exact database and role are approved.
    process.env.ADMIN_DATABASE_URL = candidate;
    process.env.WEB_DATABASE_URL = candidate;
    process.env.DATABASE_URL = candidate;
    const { prisma } = await import("@/lib/prisma");
    db = prisma;
    const [identity] = await db.$queryRaw<Array<{
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
      throw Error("BILLING_ACCEPTANCE_PRISMA_TARGET_MISMATCH");
    }
    const [tables] = await db.$queryRaw<Array<{
      has_subscription: boolean; has_event: boolean; has_grant: boolean;
    }>>`
      SELECT to_regclass('public."Subscription"') IS NOT NULL AS has_subscription,
        to_regclass('public."StripeEvent"') IS NOT NULL AS has_event,
        to_regclass('public."FeatureGrant"') IS NOT NULL AS has_grant
    `;
    if (!tables?.has_subscription || !tables.has_event || !tables.has_grant) {
      throw Error("BILLING_ACCEPTANCE_SCHEMA_NOT_READY");
    }
    preflightOk = true;

    const StripeClass = (await import("stripe")).default;
    const stripeSecret = `sk_test_${prefix}`; // only the local Stripe SDK
    webhookSecret = `whsec_${prefix}`;      // ephemeral signing key, no provider account
    stripe = new StripeClass(stripeSecret);
    subscription = currentSubscription("active");
    provider.current = {
      webhooks: stripe.webhooks,
      subscriptions: { retrieve: async (id: string) => {
        if (failNextRetrieve) {
          failNextRetrieve = false;
          throw Error("SYNTHETIC_STRIPE_UNAVAILABLE");
        }
        if (id === learningSubscriptionId && learningSubscription) return learningSubscription;
        if (id !== subscriptionId) throw Error("SYNTHETIC_FOREIGN_SUBSCRIPTION");
        return subscription;
      } },
    };
    process.env.LEARNOIR_STRIPE_SECRET_KEY = stripeSecret;
    process.env.STRIPE_WEBHOOK_SECRET = webhookSecret;
    process.env.ZOEBUILD_AI_STRIPE_PRICE_IDS = priceId;
    process.env.ZOEBUILD_AI_STRIPE_PRODUCT_IDS = productId;
    process.env.STRIPE_PRICE_MONTHLY_ID = learningPriceId;

    await db.user.create({ data: { id: userId, stripeCustomerId: customerId } });
    fixtureCreated = true;
    route = await import("../../app/api/stripe/webhook/route");
  }, 30000);

  afterAll(async () => {
    if (!preflightOk) return;
    try {
      // Append-only-safe: do not delete test history or disable billing protections.
      if (!fixtureCreated) return;
      // Leave no synthetic account with active subscription-backed grants.
      // This is a normal signed cancellation through the canonical writer,
      // never trigger bypass, global cleanup, or deletion of financial audit.
      if (route) {
        subscription = currentSubscription("canceled");
        failNextRetrieve = false;
        const terminalEvent = makeEvent("customer.subscription.deleted");
        const finalization = await postSigned(terminalEvent);
        if (finalization.status !== 200 || finalization.body.outcome !== "processed" ||
            (await activeGrants()).length !== 0) {
          throw Error("BILLING_ACCEPTANCE_SYNTHETIC_ENTITLEMENT_FINALIZATION_FAILED");
        }
      }
      if (learningSubscription) {
        learningSubscription = currentLearningSubscription("canceled", { periodDays: 60 });
        const learningFinal = await postSigned(makeEvent("customer.subscription.deleted", {
          subscriptionId: learningSubscriptionId,
        }));
        if (learningFinal.status !== 200 || learningFinal.body.outcome !== "processed") {
          throw Error("BILLING_CROSSAPP_LEARNING_FINALIZATION_FAILED");
        }
      }
      const user = await db.user.findUnique({ where: { id: userId } });
      const eventCount = await db.stripeEvent.count({ where: { id: { in: eventIds } } });
      const grantCount = await db.featureGrant.count({ where: { userId, type: "subscription" } });
      if (!user || eventCount === 0 || grantCount === 0 ||
          !/^pg-billing-[0-9a-f-]{36}$/.test(user.id)) {
        throw Error("BILLING_ACCEPTANCE_FIXTURE_AUDIT_FAILED");
      }
      console.log(`BILLING_PG_AUDIT_PASS users=1 events=${eventCount} subscriptionGrants=${grantCount} retained=YES writes=NO`);
    } finally {
      await db.$disconnect();
    }
  }, 30000);

  it("accepts a real HMAC-signed event, persists the current subscription, and grants both capabilities", async () => {
    await expectProcessed(makeEvent("customer.subscription.updated", { staleStatus: "trialing" }));
    expect(await storedSubscription()).toMatchObject({
      userId, stripeCustomerId: customerId, priceId, billingProduct: "builder_ai",
      status: "active", cancelAtPeriodEnd: false,
    });
    const grants = await activeGrants();
    expect(grants.map(g => g.feature).sort()).toEqual(["build_ai_edit", "build_ai_generate"]);
  }, 30000);

  it("treats redelivery of the same signed event as a terminal duplicate, without re-granting", async () => {
    const event = makeEvent("customer.subscription.updated");
    await expectProcessed(event);
    const before = await db.featureGrant.count({ where: { userId, type: "subscription" } });
    const second = await postSigned(event);
    expect(second).toMatchObject({ status: 200, body: { duplicate: true, outcome: "processed" } });
    expect(await db.featureGrant.count({ where: { userId, type: "subscription" } })).toBe(before);
    expect((await db.stripeEvent.findUniqueOrThrow({ where: { id: event.id } })).attemptCount).toBe(1);
  });

  it("keeps grants through scheduled cancellation and extends them on a verified renewal", async () => {
    subscription = currentSubscription("active", { cancelAtPeriodEnd: true, periodDays: 15 });
    await expectProcessed(makeEvent("customer.subscription.updated"));
    expect(await storedSubscription()).toMatchObject({ status: "active", cancelAtPeriodEnd: true });
    expect(await activeGrants()).toHaveLength(2);
    const firstEnd = (await storedSubscription())?.currentPeriodEnd;

    subscription = currentSubscription("active", { cancelAtPeriodEnd: false, periodDays: 60 });
    await expectProcessed(makeEvent("invoice.paid", { staleStatus: "canceled" }));
    expect((await storedSubscription())?.currentPeriodEnd?.getTime()).toBeGreaterThan(firstEnd!.getTime());
    expect(await activeGrants()).toHaveLength(2);
  }, 30000);

  it.runIf(process.env.BILLING_CROSSAPP_ACCEPTANCE_RUN === "V12J5B_VERIFIED_DEVELOPMENT_DATABASE")(
    "reads signed-webhook PostgreSQL lifecycle through Learning and ZoeBuild billing consumers",
    async () => {
      // This test ONLY runs with the second explicit acceptance approval.
      // The preceding V12J.5A steps have already activated and renewed the
      // *same* synthetic Builder subscription through actual signed webhooks.
      const { inspectBuilderAiBillingForUser } = await import("./reconcileBuilderAiBillingForUser");
      const { getEntitlementForUser } = await import("./entitlement");
      const repo = fileURLToPath(new URL("../../../../../", import.meta.url));
      async function assertConsumers(stage: "active" | "scheduled" | "renewed" | "canceled",
        builderAccess: boolean, learningAccess: boolean) {
        const projection = await inspectBuilderAiBillingForUser(userId, { client: db });
        expect(projection.eligible).toBe(builderAccess);
        const learning = await getEntitlementForUser(userId);
        expect(learning.ok).toBe(learningAccess);
        const child = spawnSync("pnpm", ["--filter", "@zoeskoul/zoebuild", "exec", "vitest", "run",
          "src/lib/billing/billingCrossAppPostgres.acceptance.test.ts"], {
          cwd: repo, encoding: "utf8", timeout: 45000, maxBuffer: 1024 * 1024,
          env: { ...process.env, BILLING_CROSSAPP_STAGE: stage,
            BILLING_CROSSAPP_USER_ID: userId,
            BILLING_CROSSAPP_SUBSCRIPTION_ID: subscriptionId,
            BILLING_CROSSAPP_EXPECT_LEARNING: String(learningAccess),
          },
        });
        if (child.error || child.status !== 0) {
          throw Error(`BILLING_CROSSAPP_CONSUMER_FAILED stage=${stage} status=${child.status}\n${child.stdout ?? ""}\n${child.stderr ?? ""}\n${String(child.error ?? "")}`);
        }
        console.log(`BILLING_CROSSAPP_STAGE_PASS stage=${stage} builder=${builderAccess} learning=${learningAccess}`);
      }

      // A Builder subscription must not silently purchase Learning access.
      await assertConsumers("active", true, false);
      learningSubscription = currentLearningSubscription("active", { periodDays: 30 });
      await expectProcessed(makeEvent("customer.subscription.updated", {
        subscriptionId: learningSubscriptionId,
      }), learningSubscriptionId);
      await assertConsumers("active", true, true);

      subscription = currentSubscription("active", { cancelAtPeriodEnd: true, periodDays: 25 });
      learningSubscription = currentLearningSubscription("active", { cancelAtPeriodEnd: true, periodDays: 25 });
      await expectProcessed(makeEvent("customer.subscription.updated"));
      await expectProcessed(makeEvent("customer.subscription.updated", {
        subscriptionId: learningSubscriptionId,
      }), learningSubscriptionId);
      await assertConsumers("scheduled", true, true);
      const oldBuilderEnd = (await storedSubscription())?.currentPeriodEnd;
      const oldLearningEnd = (await db.subscription.findUnique({ where: {
        stripeSubscriptionId: learningSubscriptionId,
      } }))?.currentPeriodEnd;

      subscription = currentSubscription("active", { periodDays: 65 });
      learningSubscription = currentLearningSubscription("active", { periodDays: 65 });
      await expectProcessed(makeEvent("invoice.paid", { staleStatus: "canceled" }));
      await expectProcessed(makeEvent("invoice.paid", {
        subscriptionId: learningSubscriptionId, staleStatus: "canceled",
      }), learningSubscriptionId);
      expect((await storedSubscription())?.currentPeriodEnd?.getTime()).toBeGreaterThan(oldBuilderEnd!.getTime());
      expect((await db.subscription.findUnique({ where: {
        stripeSubscriptionId: learningSubscriptionId,
      } }))?.currentPeriodEnd?.getTime()).toBeGreaterThan(oldLearningEnd!.getTime());
      await assertConsumers("renewed", true, true);

      // The two product domains revoke independently. A terminated Builder
      // subscription cannot revoke a still-current Learning subscription.
      subscription = currentSubscription("canceled", { periodDays: 65 });
      await expectProcessed(makeEvent("customer.subscription.deleted"));
      await assertConsumers("canceled", false, true);
      learningSubscription = currentLearningSubscription("canceled", { periodDays: 65 });
      await expectProcessed(makeEvent("customer.subscription.deleted", {
        subscriptionId: learningSubscriptionId,
      }), learningSubscriptionId);
      await assertConsumers("canceled", false, false);
      expect(await activeGrants()).toHaveLength(0);
    }, 120000,
  );

  it("revokes subscription grants after provider cancellation; a stale active event cannot restore them", async () => {
    subscription = currentSubscription("canceled", { periodDays: 60 });
    await expectProcessed(makeEvent("customer.subscription.deleted", { staleStatus: "active" }));
    expect((await storedSubscription())?.status).toBe("canceled");
    expect(await activeGrants()).toHaveLength(0);

    await expectProcessed(makeEvent("customer.subscription.updated", { staleStatus: "active" }));
    expect((await storedSubscription())?.status).toBe("canceled");
    expect(await activeGrants()).toHaveLength(0);
  }, 30000);

  it("rejects invalid signatures and cross-mode webhooks before creating event ledger rows", async () => {
    const badSignature = makeEvent("customer.subscription.updated");
    expect((await postSigned(badSignature, { tamper: true })).status).toBe(400);
    expect(await db.stripeEvent.findUnique({ where: { id: badSignature.id } })).toBeNull();

    const wrongMode = makeEvent("customer.subscription.updated", { livemode: true });
    expect((await postSigned(wrongMode)).status).toBe(400);
    expect(await db.stripeEvent.findUnique({ where: { id: wrongMode.id } })).toBeNull();
  });

  it("records transient provider failure then safely retries the same signed event", async () => {
    subscription = currentSubscription("active", { periodDays: 30 });
    const evt = makeEvent("customer.subscription.updated");
    failNextRetrieve = true;
    const failed = await postSigned(evt);
    expect(failed).toMatchObject({ status: 500, body: { outcome: "failed" } });
    expect((await db.stripeEvent.findUniqueOrThrow({ where: { id: evt.id } })).status).toBe("failed");
    const retried = await postSigned(evt);
    expect(retried).toMatchObject({ status: 200, body: { outcome: "processed" } });
    expect((await db.stripeEvent.findUniqueOrThrow({ where: { id: evt.id } })).attemptCount).toBe(2);
  }, 30000);

  it("does not attach another Stripe customer to the synthetic user", async () => {
    subscription = currentSubscription("active", { customerId: `cus_foreign_${prefix}` });
    const evt = makeEvent("customer.subscription.updated");
    const result = await postSigned(evt);
    expect(result).toMatchObject({ status: 200, body: { outcome: "ignored" } });
    expect((await storedSubscription())?.stripeCustomerId).toBe(customerId);
    expect((await db.user.findUniqueOrThrow({ where: { id: userId } })).stripeCustomerId).toBe(customerId);
  });
});
