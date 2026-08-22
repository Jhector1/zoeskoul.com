import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { isCheckoutAttemptId } from "@/lib/billing/checkoutAttempt";
import { findExistingCheckoutSessionForAttempt } from "@/lib/billing/stripeService";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ZOESKOUL_CANONICAL_PENDING_CHECKOUT_RESUME
// Navigation adapter only. Checkout creation/switching stays in POST
// /api/billing/checkout and expiration cleanup stays in the Stripe webhook.

function sameOriginUrl(req: Request, pathname: string) {
  return new URL(pathname, req.url);
}

function trustedStripeCheckoutUrl(raw: unknown): URL | null {
  if (typeof raw !== "string" || !raw) return null;

  try {
    const url = new URL(raw);
    return url.protocol === "https:" && url.hostname === "checkout.stripe.com"
      ? url
      : null;
  } catch {
    return null;
  }
}

function billingFallback(req: Request) {
  return NextResponse.redirect(sameOriginUrl(req, "/billing"));
}

export async function GET(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;

  if (!userId) {
    return NextResponse.redirect(
      sameOriginUrl(
        req,
        "/auth/signin?callbackUrl=%2Fbilling",
      ),
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { billingCheckoutAttemptId: true },
  });

  const checkoutAttemptId = user?.billingCheckoutAttemptId ?? null;
  if (!isCheckoutAttemptId(checkoutAttemptId)) {
    return billingFallback(req);
  }

  try {
    const checkout = await findExistingCheckoutSessionForAttempt({
      userId,
      checkoutAttemptId,
    });

    if (checkout?.status !== "open") {
      return billingFallback(req);
    }

    const stripeUrl = trustedStripeCheckoutUrl(checkout.url);
    if (!stripeUrl) {
      return billingFallback(req);
    }

    return NextResponse.redirect(stripeUrl);
  } catch (error) {
    console.error(
      "[/api/billing/checkout/resume] could not verify pending Checkout",
      error,
    );
    return billingFallback(req);
  }
}
