import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readSource = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

describe("billing Checkout resume UX", () => {
  it("turns CHECKOUT_ALREADY_IN_PROGRESS into a Resume state without showing an error", () => {
    const source = readSource("./useBillingActions.ts");

    expect(source).toContain('data?.code === "CHECKOUT_ALREADY_IN_PROGRESS"');
    expect(source).toContain("setCheckoutResumeTarget({ plan, useTrial })");
    expect(source).toContain("onError(null)");
    expect(source).toContain("isCheckoutResume");
  });

  it("clears the newer browser attempt before opening a resumed old Stripe Session", () => {
    const source = readSource("./useBillingActions.ts");

    expect(source).toContain("data?.resumed === true && checkoutAttemptId");
    expect(source).toContain("clearBrowserCheckoutAttempt(checkoutAttemptId)");
  });

  it("labels paid and trial plan actions as Resume checkout only for the matching target", () => {
    const page = readFileSync(
      new URL(
        "../../../app/(public)/[locale]/(platform)/billing/BillingPageClient.tsx",
        import.meta.url,
      ),
      "utf8",
    );

    expect(page).toContain('isCheckoutResume("monthly", false)');
    expect(page).toContain('isCheckoutResume("monthly", true)');
    expect(page).toContain('isCheckoutResume("yearly", false)');
    expect(page).toContain('isCheckoutResume("yearly", true)');
    expect(page.match(/t\("plans\.resumeCheckout"\)/g)).toHaveLength(4);
  });
});
