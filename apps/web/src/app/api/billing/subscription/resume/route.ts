import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { getEntitlementForUser } from "@/lib/billing/entitlement";
import {
  resumeScheduledSubscriptionForUser,
  syncSubscriptionsForUser,
} from "@/lib/billing/stripeService";
import { canResumeScheduledSubscription } from "@/lib/billing/period";
import { enforceSameOriginPost } from "@/lib/practice/api/shared/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!enforceSameOriginPost(req)) {
    return NextResponse.json(
      { ok: false, message: "Forbidden." },
      { status: 403 },
    );
  }

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json(
      { ok: false, message: "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    await syncSubscriptionsForUser(userId);
  } catch (error) {
    console.error(
      "[/api/billing/subscription/resume] Stripe freshness check failed",
      error,
    );
    return NextResponse.json(
      {
        ok: false,
        code: "BILLING_SYNC_UNAVAILABLE",
        message: "Could not verify your current subscription. Please retry.",
      },
      { status: 503 },
    );
  }

  const entitlement = await getEntitlementForUser(userId);
  const resumable =
    Boolean(entitlement.subscriptionId) &&
    Boolean(entitlement.cancelAtPeriodEnd) &&
    canResumeScheduledSubscription({
      status: entitlement.status,
      trialEnd: entitlement.trialEnd,
      currentPeriodEnd: entitlement.currentPeriodEnd,
      cancelAtPeriodEnd: entitlement.cancelAtPeriodEnd,
    });

  if (!resumable || !entitlement.subscriptionId) {
    return NextResponse.json(
      {
        ok: false,
        code: "NO_SCHEDULED_CANCELLATION",
        message: "There is no active scheduled cancellation to resume.",
      },
      { status: 409 },
    );
  }

  try {
    const saved = await resumeScheduledSubscriptionForUser({
      userId,
      subscriptionId: entitlement.subscriptionId,
    });

    if (!saved) {
      return NextResponse.json(
        {
          ok: false,
          code: "SUBSCRIPTION_NOT_RESUMABLE",
          message: "This subscription can no longer be resumed.",
        },
        { status: 409 },
      );
    }

    return NextResponse.json({
      ok: true,
      status: saved.status,
      subscriptionId: saved.subscriptionId,
      priceId: saved.priceId,
      trialEnd: saved.trialEnd
        ? saved.trialEnd.toISOString()
        : null,
      currentPeriodEnd: saved.currentPeriodEnd
        ? saved.currentPeriodEnd.toISOString()
        : null,
      cancelAtPeriodEnd: saved.cancelAtPeriodEnd,
    });
  } catch (error) {
    console.error(
      "[/api/billing/subscription/resume] ERROR",
      error,
    );
    return NextResponse.json(
      {
        ok: false,
        message: "Could not resume the subscription. Please retry.",
      },
      { status: 500 },
    );
  }
}
