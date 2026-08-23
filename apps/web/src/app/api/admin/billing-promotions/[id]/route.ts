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

type Context = { params: Promise<{ id: string }> };

async function adminDenied(req: Request) {
  const denied = await requireAdmin(req);
  return denied ? applyAppCorsHeaders(req, denied) : null;
}

export async function PATCH(req: Request, context: Context) {
  if (!isAppOriginAllowed(req)) {
    return appCorsJson(req, { error: "Forbidden." }, { status: 403 });
  }

  const denied = await adminDenied(req);
  if (denied) return denied;

  const { id } = await context.params;
  const existing = await prisma.billingPromotionCampaign.findUnique({
    where: { id },
  });

  if (!existing) {
    return appCorsJson(req, { error: "Promotion not found." }, { status: 404 });
  }

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
  const couponNeedsReplacement =
    existing.name !== parsed.data.name ||
    existing.percentOff !== parsed.data.percentOff ||
    existing.couponDuration !== parsed.data.couponDuration ||
    existing.couponDurationMonths !== parsed.data.couponDurationMonths ||
    existing.endsAt.getTime() !== endsAt.getTime();

  if (
    (parsed.data.enabled || couponNeedsReplacement) &&
    !stripeCouponEndIsAllowed(endsAt)
  ) {
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
      excludeId: id,
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

  let stripeCouponId = existing.stripeCouponId;
  if (couponNeedsReplacement) {
    const coupon = await createBillingPromotionCoupon({
      campaignId: id,
      name: parsed.data.name,
      percentOff: parsed.data.percentOff,
      couponDuration: parsed.data.couponDuration,
      couponDurationMonths: parsed.data.couponDurationMonths,
      endsAt,
    });
    stripeCouponId = coupon.id;
  }

  const campaign = await prisma.billingPromotionCampaign.update({
    where: { id },
    data: {
      name: parsed.data.name,
      percentOff: parsed.data.percentOff,
      planScope: parsed.data.planScope,
      couponDuration: parsed.data.couponDuration,
      couponDurationMonths: parsed.data.couponDurationMonths,
      startsAt,
      endsAt,
      enabled: parsed.data.enabled,
      stripeCouponId,
    },
  });

  return appCorsJson(req, { campaign });
}

export function OPTIONS(req: Request) {
  return appCorsPreflight(req);
}
