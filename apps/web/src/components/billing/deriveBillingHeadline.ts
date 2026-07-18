import type { BillingStatus } from "@/lib/billing/types";
import { fmtShortDate } from "@/lib/billing/format";

export type BillingHeadline = {
  tone: "neutral" | "good" | "warn" | "danger" | "info";
  text: string;
  href?: string;
};

const BILLING_HREF = "/billing";

export function deriveBillingHeadline(
  status: BillingStatus | null,
  intlLocale: string,
): BillingHeadline | null {
  if (!status?.isAuthenticated) return null;

  const stripeStatus = status.stripeStatus;

  if (stripeStatus === "trialing" && status.isSubscribed) {
    const end = status.trialEndsAt
      ? fmtShortDate(status.trialEndsAt, intlLocale)
      : null;
    return {
      tone: "good",
      text: end ? `Trial active • ends ${end}` : "Trial active",
      href: BILLING_HREF,
    };
  }

  if (stripeStatus === "active" && status.isSubscribed) {
    return {
      tone: "good",
      text: "Active subscription",
      href: BILLING_HREF,
    };
  }

  if (stripeStatus === "past_due" || stripeStatus === "unpaid") {
    return {
      tone: "danger",
      text: "Payment failed",
      href: BILLING_HREF,
    };
  }

  if (stripeStatus === "incomplete" || stripeStatus === "incomplete_expired") {
    return {
      tone: "warn",
      text: "Finish payment",
      href: BILLING_HREF,
    };
  }

  if (stripeStatus === "paused") {
    return {
      tone: "warn",
      text: "Subscription paused",
      href: BILLING_HREF,
    };
  }

  if (stripeStatus === "canceled" && status.isSubscribed) {
    const end = status.currentPeriodEnd
      ? fmtShortDate(status.currentPeriodEnd, intlLocale)
      : null;
    return {
      tone: "neutral",
      text: end ? `Access until ${end}` : "Subscription ending",
      href: BILLING_HREF,
    };
  }

  if (status.trialEligible) {
    return {
      tone: "good",
      text: "Start free trial",
      href: BILLING_HREF,
    };
  }

  if (stripeStatus === "canceled" || stripeStatus === "active" || stripeStatus === "trialing") {
    return {
      tone: "neutral",
      text: "Renew subscription",
      href: BILLING_HREF,
    };
  }

  return {
    tone: "neutral",
    text: "Choose a plan",
    href: BILLING_HREF,
  };
}
