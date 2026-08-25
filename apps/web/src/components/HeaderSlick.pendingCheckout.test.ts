import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const webAdapter = readFileSync(
  new URL("./HeaderSlick.tsx", import.meta.url),
  "utf8",
);

const sharedHeader = readFileSync(
  new URL(
    "../../../../packages/learner-ui/src/LearnerHeaderSlick.tsx",
    import.meta.url,
  ),
  "utf8",
);

describe("HeaderSlick pending Checkout action", () => {
  it("keeps Resume checkout presentation canonical and Web execution app-owned", () => {
    expect(sharedHeader).toContain(
      'headlineBadge.action === "resume_checkout"',
    );
    expect(sharedHeader).toContain(
      'checkoutResume.kind === "link"',
    );
    expect(sharedHeader).toContain(
      "data-testid={checkoutResume.testId}",
    );
    expect(sharedHeader).toContain(
      "onClick={checkoutResume.onActivate}",
    );

    expect(webAdapter).toContain(
      'import { useBillingActions } from "@/components/billing/hooks/useBillingActions"',
    );
    expect(webAdapter).toContain("useResumeCheckout:");
    expect(webAdapter).toContain(
      'testId: "header-resume-checkout"',
    );
    expect(webAdapter).toContain("startCheckout(");
    expect(webAdapter).toContain(
      "localStatus.pendingCheckout!.plan",
    );
    expect(webAdapter).toContain(
      "localStatus.pendingCheckout!.useTrial",
    );
  });

  it("does not duplicate the Checkout API or Stripe URL logic in either owner", () => {
    for (const source of [webAdapter, sharedHeader]) {
      expect(source).not.toContain(
        'fetch("/api/billing/checkout"',
      );
      expect(source).not.toContain("checkout.stripe.com");
      expect(source).not.toContain(
        "window.location.href = data.url",
      );
    }
  });
});
