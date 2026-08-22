import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./StudentHeaderSlick.tsx", import.meta.url),
  "utf8",
);

describe("StudentHeaderSlick pending Checkout", () => {
  it("shows Resume checkout through the website-owned direct Stripe resume route", () => {
    expect(source).toContain("billingStatus?.pendingCheckout");
    expect(source).toContain('headlineBadge.action === "resume_checkout"');
    expect(source).toContain('"/api/billing/checkout/resume"');
    expect(source).toContain("websiteOrigin");
    expect(source).toContain(
      'data-testid="student-header-resume-checkout"',
    );
  });

  it("does not duplicate Stripe Checkout creation or reservation logic in Student", () => {
    expect(source).not.toContain('fetch("/api/billing/checkout"');
    expect(source).not.toContain("checkoutAttemptId");
    expect(source).not.toContain("expireOpenCheckoutSession");
    expect(source).not.toContain("releaseBillingCheckoutReservation");
  });
});
