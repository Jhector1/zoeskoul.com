import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  findOverlap: vi.fn(),
  couponCreate: vi.fn(),
  campaignFindUnique: vi.fn(),
  campaignUpdate: vi.fn(),
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
      findUnique: mocks.campaignFindUnique,
      update: mocks.campaignUpdate,
    },
  },
}));

import { OPTIONS, PATCH } from "./route";

const ID = "campaign_1";
const ADMIN_ORIGIN = "http://localhost:3001";
const BODY = {
  name: "Launch week",
  percentOff: 20,
  planScope: "both",
  startsAt: "2026-08-22T15:00:00.000Z",
  endsAt: "2026-08-29T15:00:00.000Z",
  enabled: true,
};
const context = { params: Promise.resolve({ id: ID }) };

function request(args?: {
  origin?: string;
  body?: Record<string, unknown>;
  method?: string;
}) {
  const method = args?.method ?? "PATCH";
  return new Request(
    `http://localhost:3000/api/admin/billing-promotions/${ID}`,
    {
      method,
      headers: {
        Origin: args?.origin ?? ADMIN_ORIGIN,
        ...(method === "PATCH" ? { "Content-Type": "application/json" } : {}),
      },
      body:
        method === "PATCH"
          ? JSON.stringify(args?.body ?? BODY)
          : undefined,
    },
  );
}

describe("Admin-app billing promotion update route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue(null);
    mocks.findOverlap.mockResolvedValue(null);
    mocks.couponCreate.mockResolvedValue({ id: "coupon_new" });
    mocks.campaignFindUnique.mockResolvedValue({
      id: ID,
      name: "Launch week",
      percentOff: 20,
      planScope: "both",
      startsAt: new Date("2026-08-22T15:00:00.000Z"),
      endsAt: new Date("2026-08-29T15:00:00.000Z"),
      enabled: true,
      couponDuration: "once",
      couponDurationMonths: null,
      stripeCouponId: "coupon_old",
      createdAt: new Date("2026-08-22T15:00:00.000Z"),
      updatedAt: new Date("2026-08-22T15:00:00.000Z"),
    });
    mocks.campaignUpdate.mockImplementation(async ({ data }) => ({
      id: ID,
      ...data,
      createdAt: new Date("2026-08-22T15:00:00.000Z"),
      updatedAt: new Date("2026-08-22T16:00:00.000Z"),
    }));
  });

  it("preflights from the Admin app", () => {
    const response = OPTIONS(request({ method: "OPTIONS" }));
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(ADMIN_ORIGIN);
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain("PATCH");
  });

  it("rejects an untrusted browser origin before auth or mutation", async () => {
    const response = await PATCH(
      request({ origin: "https://evil.example" }),
      context,
    );
    expect(response.status).toBe(403);
    expect(mocks.requireAdmin).not.toHaveBeenCalled();
    expect(mocks.campaignFindUnique).not.toHaveBeenCalled();
    expect(mocks.campaignUpdate).not.toHaveBeenCalled();
  });

  it("preserves the existing Stripe coupon when economics did not change", async () => {
    const response = await PATCH(
      request({ body: { ...BODY, enabled: false } }),
      context,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(ADMIN_ORIGIN);
    expect(mocks.couponCreate).not.toHaveBeenCalled();
    expect(mocks.campaignUpdate).toHaveBeenCalledWith({
      where: { id: ID },
      data: expect.objectContaining({
        enabled: false,
        stripeCouponId: "coupon_old",
      }),
    });
  });

  it("creates a replacement coupon when percentage changes", async () => {
    const response = await PATCH(
      request({ body: { ...BODY, percentOff: 35 } }),
      context,
    );
    expect(response.status).toBe(200);
    expect(mocks.couponCreate).toHaveBeenCalledWith(
      expect.objectContaining({ campaignId: ID, percentOff: 35 }),
    );
    expect(mocks.campaignUpdate).toHaveBeenCalledWith({
      where: { id: ID },
      data: expect.objectContaining({
        percentOff: 35,
        stripeCouponId: "coupon_new",
      }),
    });
  });

  it("creates a replacement coupon when coupon duration changes", async () => {
    const response = await PATCH(
      request({ body: { ...BODY, couponDuration: "repeating", couponDurationMonths: 3 } }),
      context,
    );
    expect(response.status).toBe(200);
    expect(mocks.couponCreate).toHaveBeenCalledWith(expect.objectContaining({
      campaignId: ID, couponDuration: "repeating", couponDurationMonths: 3,
    }));
    expect(mocks.campaignUpdate).toHaveBeenCalledWith({
      where: { id: ID },
      data: expect.objectContaining({
        couponDuration: "repeating", couponDurationMonths: 3, stripeCouponId: "coupon_new",
      }),
    });
  });

});
