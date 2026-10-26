import { beforeEach, describe, expect, it, vi } from "vitest";
import { FeatureKey } from "@zoeskoul/db";

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  findGrants: vi.fn(),
  inspectBilling: vi.fn(),
}));

vi.mock("@/lib/access/currentUserAccess", () => ({ getCurrentUserAccess: mocks.access }));
vi.mock("@/lib/prisma", () => ({
  prisma: { featureGrant: { findMany: mocks.findGrants } },
}));
vi.mock("@/lib/billing/reconcileBuilderAiBillingForUser", () => ({
  inspectBuilderAiBillingForUser: mocks.inspectBilling,
}));

import { GET } from "./route";

function request(origin?: string, query = "") {
  return new Request(`http://localhost:3000/api/account/zoebuild-ai-access${query}`, {
    headers: origin ? { Origin: origin } : undefined,
  });
}

const currentAccess = {
  authenticated: true,
  user: { id: "signed_in_user", email: null, name: null, image: null },
  capabilities: { isAdmin: false },
};

describe("Self-scoped Builder AI access inspection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.access.mockResolvedValue(currentAccess);
    mocks.findGrants.mockResolvedValue([]);
    mocks.inspectBilling.mockResolvedValue({
      catalogConfigured: false, subscriptionCount: 0,
      matchedProductCount: 0, eligibleSubscriptionCount: 0,
      eligible: false, endsAt: null,
    });
  });

  it("refuses untrusted origins before session or database access", async () => {
    const response = await GET(request("https://attacker.example"));
    expect(response.status).toBe(403);
    expect(mocks.access).not.toHaveBeenCalled();
    expect(mocks.findGrants).not.toHaveBeenCalled();
    expect(mocks.inspectBilling).not.toHaveBeenCalled();
  });

  it("requires an authenticated user", async () => {
    mocks.access.mockResolvedValue({authenticated: false, user: null, capabilities: {isAdmin: false}});
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(mocks.findGrants).not.toHaveBeenCalled();
    expect(mocks.inspectBilling).not.toHaveBeenCalled();
  });

  it("reads ONLY the signed-in user's grants, never query-supplied user IDs", async () => {
    const response = await GET(request(undefined, "?userId=another_user"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(mocks.findGrants).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        userId: "signed_in_user",
        feature: { in: [FeatureKey.build_ai_generate, FeatureKey.build_ai_edit] },
        revokedAt: null,
      },
    }));
    expect(mocks.inspectBilling).toHaveBeenCalledWith("signed_in_user", expect.objectContaining({ now: expect.any(Date) }));
    expect(await response.json()).toMatchObject({
      isAdmin: false,
      billing: {catalogConfigured: false, subscriptionCount: 0, matchedProductCount: 0, eligible: false, grantMismatch: false},
      features: {
        build_ai_generate: { enabled: false, activeGrantCount: 0 },
        build_ai_edit: { enabled: false, activeGrantCount: 0 },
      },
    });
  });

  it("separates generation and editing, excluding future and expired grants", async () => {
    const now = Date.now();
    mocks.findGrants.mockResolvedValue([
      { feature: FeatureKey.build_ai_generate, type: "subscription", startsAt: new Date(now - 60_000), endsAt: new Date(now + 60_000) },
      { feature: FeatureKey.build_ai_edit, type: "subscription", startsAt: null, endsAt: new Date(now - 60_000) },
      { feature: FeatureKey.build_ai_edit, type: "admin", startsAt: new Date(now + 60_000), endsAt: null },
    ]);
    const response = await GET(request());
    const body = await response.json();
    expect(body.features.build_ai_generate).toEqual({
      enabled: true, activeGrantCount: 1, grantTypes: ["subscription"],
    });
    expect(body.features.build_ai_edit).toEqual({
      enabled: false, activeGrantCount: 0, grantTypes: [],
    });
    expect(JSON.stringify(body)).not.toContain("signed_in_user");
  });

  it("does not leak database errors", async () => {
    mocks.findGrants.mockRejectedValue(new Error("private connection details"));
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private connection details");
  });
});
