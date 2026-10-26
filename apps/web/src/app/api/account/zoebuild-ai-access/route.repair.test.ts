import { beforeEach, describe, expect, it, vi } from "vitest";
import { FeatureKey } from "@zoeskoul/db";

const mocks = vi.hoisted(() => ({
  access: vi.fn(), findGrants: vi.fn(), inspect: vi.fn(), sync: vi.fn(), limit: vi.fn(),
}));
vi.mock("@/lib/access/currentUserAccess", () => ({ getCurrentUserAccess: mocks.access }));
vi.mock("@/lib/prisma", () => ({ prisma: { featureGrant: { findMany: mocks.findGrants } } }));
vi.mock("@/lib/billing/reconcileBuilderAiBillingForUser", () => ({
  inspectBuilderAiBillingForUser: mocks.inspect,
}));
vi.mock("@/lib/billing/stripeService", () => ({ syncSubscriptionsForUser: mocks.sync }));
vi.mock("@zoeskoul/platform-server/security/ratelimit", () => ({ rateLimit: mocks.limit }));
import { GET, POST } from "./route";

const account = { authenticated: true, user: { id: "self", email: null, name: null, image: null },
  capabilities: { isAdmin: false } };
const eligible = { catalogConfigured: true, subscriptionCount: 1,
  matchedProductCount: 1, eligibleSubscriptionCount: 1, eligible: true, endsAt: new Date("2026-11-01T00:00:00Z") };
const grant = (feature: FeatureKey) => ({ feature, startsAt: null, endsAt: null, type: "subscription" });
const get = () => new Request("http://localhost:3000/api/account/zoebuild-ai-access");
const post = (origin = "http://localhost:3000") => new Request(
  "http://localhost:3000/api/account/zoebuild-ai-access",
  { method: "POST", headers: { Origin: origin } },
);

describe("Verified self-owned Builder AI reconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.access.mockResolvedValue(account);
    mocks.limit.mockResolvedValue({ ok: true });
    mocks.inspect.mockResolvedValue(eligible);
    mocks.findGrants.mockResolvedValue([grant(FeatureKey.build_ai_generate)]);
    mocks.sync.mockResolvedValue(undefined);
  });
  it("GET remains read-only and reports eligibility without identifiers", async () => {
    const response = await GET(get());
    expect(response.status).toBe(200);
    expect(mocks.sync).not.toHaveBeenCalled();
    const body = await response.json();
    expect(body.billing).toMatchObject({ eligible: true, grantMismatch: true });
    expect(JSON.stringify(body)).not.toContain("self");
  });
  it("rejects missing or foreign origin before any billing check", async () => {
    expect((await POST(new Request("http://localhost:3000/api/account/zoebuild-ai-access", { method: "POST" }))).status).toBe(403);
    expect((await POST(post("https://attacker.example"))).status).toBe(403);
    expect(mocks.sync).not.toHaveBeenCalled();
    expect(mocks.inspect).not.toHaveBeenCalled();
  });
  it("requires session identity and rate-limits expensive Stripe refresh", async () => {
    mocks.access.mockResolvedValueOnce({ authenticated: false, user: null });
    expect((await POST(post())).status).toBe(401);
    mocks.limit.mockResolvedValueOnce({ ok: false });
    expect((await POST(post())).status).toBe(429);
    expect(mocks.sync).not.toHaveBeenCalled();
  });
  it("never syncs Stripe or grants when the server cannot verify eligible local billing", async () => {
    mocks.inspect.mockResolvedValueOnce({ ...eligible, eligible: false });
    const response = await POST(post());
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("BUILDER_AI_SUBSCRIPTION_NOT_ELIGIBLE");
    expect(mocks.sync).not.toHaveBeenCalled();
  });
  it("syncs only the signed-in user's verified Stripe subscription and rechecks both grants", async () => {
    mocks.findGrants.mockResolvedValueOnce([grant(FeatureKey.build_ai_generate), grant(FeatureKey.build_ai_edit)]);
    const response = await POST(post());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, billingEligible: true,
      generateEnabled: true, editEnabled: true });
    expect(mocks.sync).toHaveBeenCalledOnce();
    expect(mocks.sync).toHaveBeenCalledWith("self");
  });
  it("does not claim success when Stripe refresh finds no eligible subscription", async () => {
    mocks.inspect.mockResolvedValueOnce(eligible).mockResolvedValueOnce({ ...eligible, eligible: false });
    const response = await POST(post());
    expect(response.status).toBe(409);
    expect((await response.json()).ok).toBe(false);
  });
});
