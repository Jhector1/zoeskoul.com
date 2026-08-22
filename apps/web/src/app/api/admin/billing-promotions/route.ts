import { randomUUID } from "node:crypto";
import { requireAdmin } from "@/lib/admin/requireAdmin";
import { findOverlappingBillingPromotion } from "@/lib/billing/promotion.server";
import { BillingPromotionWriteSchema, stripeCouponEndIsAllowed } from "@/lib/billing/promotionAdmin";
import { createBillingPromotionCoupon } from "@/lib/billing/stripeService";
import {
  appCorsJson,
  appCorsPreflight,
  applyAppCorsHeaders,
  isAppOriginAllowed,
} from "@/lib/http/appCors";
import { prisma } from "@/lib/prisma";
import { readJsonSafe } from "@/lib/practice/api/shared/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function adminDenied(req: Request) {
  const denied = await requireAdmin(req);
  return denied ? applyAppCorsHeaders(req, denied) : null;
}

export async function GET(req: Request) {
  if (!isAppOriginAllowed(req)) {
    return appCorsJson(req, { error: "Forbidden." }, { status: 403 });
  }

  const denied = await adminDenied(req);
  if (denied) return denied;

  const campaigns = await prisma.billingPromotionCampaign.findMany({
    orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }],
  });

  return appCorsJson(req, { campaigns });
}

export async function POST(req: Request) {
  if (!isAppOriginAllowed(req)) {
    return appCorsJson(req, { error: "Forbidden." }, { status: 403 });
  }

  const denied = await adminDenied(req);
  if (denied) return denied;

  const parsed = BillingPromotionWriteSchema.safeParse(await readJsonSafe(req));
  if (!parsed.success) {
    return appCorsJson(
      req,
      { error: "Invalid promotion.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const startsAt = new Date(parsed.data.startsAt);
  const endsAt = new Date(parsed.data.endsAt);

  if (!stripeCouponEndIsAllowed(endsAt)) {
    return appCorsJson(
      req,
      { error: "Promotion end must be in the future and no more than five years away." },
      { status: 400 },
    );
  }

  if (parsed.data.enabled) {
    const overlap = await findOverlappingBillingPromotion({
      planScope: parsed.data.planScope,
      startsAt,
      endsAt,
    });
    if (overlap) {
      return appCorsJson(
        req,
        {
          error: `Promotion overlaps enabled campaign "${overlap.name}".`,
          code: "PROMOTION_WINDOW_CONFLICT",
        },
        { status: 409 },
      );
    }
  }

  const id = randomUUID();
  const coupon = await createBillingPromotionCoupon({
    campaignId: id,
    name: parsed.data.name,
    percentOff: parsed.data.percentOff,
    endsAt,
  });

  const campaign = await prisma.billingPromotionCampaign.create({
    data: {
      id,
      name: parsed.data.name,
      percentOff: parsed.data.percentOff,
      planScope: parsed.data.planScope,
      startsAt,
      endsAt,
      enabled: parsed.data.enabled,
      stripeCouponId: coupon.id,
    },
  });

  return appCorsJson(req, { campaign }, { status: 201 });
}

export function OPTIONS(req: Request) {
  return appCorsPreflight(req);
}
