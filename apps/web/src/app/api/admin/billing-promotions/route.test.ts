import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  findOverlap: vi.fn(),
  couponCreate: vi.fn(),
  campaignFindMany: vi.fn(),
  campaignCreate: vi.fn(),
}));

vi.mock("@/lib/admin/requireAdmin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/practice/api/shared/http", () => ({
  readJsonSafe: (req: Request) => req.json(),
}));
vi.mock("@/lib/billing/promotion.server", () => ({
  findOverlappingBillingPromotion: mocks.findOverlap,
}));
vi.mock("@/lib/billing/stripeService", () => ({
  createBillingPromotionCoupon: mocks.couponCreate,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    billingPromotionCampaign: {
      findMany: mocks.campaignFindMany,
      create: mocks.campaignCreate,
    },
  },
}));

import { GET, OPTIONS, POST } from "./route";

const ADMIN_ORIGIN = "http://localhost:3001";
const BODY = {
  name: "Launch week",
  percentOff: 20,
  planScope: "both",
  startsAt: "2026-08-22T15:00:00.000Z",
  endsAt: "2026-08-29T15:00:00.000Z",
  enabled: true,
};

function request(args?: {
  method?: string;
  origin?: string;
  body?: Record<string, unknown>;
}) {
  const method = args?.method ?? "POST";
  return new Request("http://localhost:3000/api/admin/billing-promotions", {
    method,
    headers: {
      Origin: args?.origin ?? ADMIN_ORIGIN,
      ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
    },
    body:
      method === "POST"
        ? JSON.stringify(args?.body ?? BODY)
        : undefined,
  });
}

describe("Admin-app billing promotion collection route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue(null);
    mocks.findOverlap.mockResolvedValue(null);
    mocks.couponCreate.mockResolvedValue({ id: "coupon_20" });
    mocks.campaignFindMany.mockResolvedValue([]);
    mocks.campaignCreate.mockImplementation(async ({ data }) => ({
      ...data,
      createdAt: new Date("2026-08-22T15:00:00.000Z"),
      updatedAt: new Date("2026-08-22T15:00:00.000Z"),
    }));
  });

  it("allows credentialed Admin-origin GET", async () => {
    const response = await GET(request({ method: "GET" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(ADMIN_ORIGIN);
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBe("true");
  });

  it("preflights PATCH through the shared browser-app boundary", () => {
    const response = OPTIONS(request({ method: "OPTIONS" }));
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(ADMIN_ORIGIN);
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain("PATCH");
  });

  it("rejects an untrusted origin before auth, DB, or Stripe", async () => {
    const response = await POST(
      request({ origin: "https://admin.zoeskoul.com.evil.example" }),
    );
    expect(response.status).toBe(403);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(mocks.requireAdmin).not.toHaveBeenCalled();
    expect(mocks.couponCreate).not.toHaveBeenCalled();
    expect(mocks.campaignCreate).not.toHaveBeenCalled();
  });

  it("keeps DB-role requireAdmin as authorization owner", async () => {
    mocks.requireAdmin.mockResolvedValue(
      Response.json({ error: "Forbidden" }, { status: 403 }),
    );
    const response = await POST(request());
    expect(response.status).toBe(403);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(ADMIN_ORIGIN);
    expect(mocks.couponCreate).not.toHaveBeenCalled();
  });

  it("rejects overlap before Stripe work", async () => {
    mocks.findOverlap.mockResolvedValue({ id: "existing", name: "Existing sale" });
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(mocks.couponCreate).not.toHaveBeenCalled();
  });

  it("creates the coupon server-side for an authenticated Admin request", async () => {
    const response = await POST(request());
    expect(response.status).toBe(201);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(ADMIN_ORIGIN);
    expect(mocks.couponCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Launch week",
        percentOff: 20,
        endsAt: new Date("2026-08-29T15:00:00.000Z"),
      }),
    );
    expect(mocks.campaignCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        stripeCouponId: "coupon_20",
        percentOff: 20,
        enabled: true,
      }),
    });
  });
});
