import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./HeaderSlick.tsx", import.meta.url),
  "utf8",
);

describe("HeaderSlick pending Checkout action", () => {
  it("renders Resume checkout as a direct canonical Checkout action", () => {
    expect(source).toContain(
      'import { useBillingActions } from "@/components/billing/hooks/useBillingActions"',
    );
    expect(source).toContain('headlineBadge.action === "resume_checkout"');
    expect(source).toContain('data-testid="header-resume-checkout"');
    expect(source).toContain("startBillingCheckout(");
    expect(source).toContain("billingStatus.pendingCheckout!.plan");
    expect(source).toContain("billingStatus.pendingCheckout!.useTrial");
  });

  it("does not duplicate the Checkout API or Stripe URL logic in the header", () => {
    expect(source).not.toContain('fetch("/api/billing/checkout"');
    expect(source).not.toContain("checkout.stripe.com");
    expect(source).not.toContain("window.location.href = data.url");
  });
});
