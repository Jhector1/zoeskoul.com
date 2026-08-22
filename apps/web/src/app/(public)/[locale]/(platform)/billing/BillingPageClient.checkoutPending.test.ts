import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./BillingPageClient.tsx", import.meta.url),
  "utf8",
);

describe("Billing pending Checkout presentation", () => {
  it("collapses an open Checkout to Resume/Switch and reveals plan cards only on demand", () => {
    expect(source).toContain("status?.pendingCheckout");
    expect(source).toContain("pendingCheckout && !showPlanChoices");
    expect(source).toContain('t("plans.resumeCheckout")');
    expect(source).toContain('t("plans.switchPlan")');
    expect(source).toContain("setSwitchingPendingCheckout(pendingCheckoutKey)");
    expect(source).toContain("isPendingCheckoutIntent");
    expect(source).toContain('startSelectedCheckout("monthly", false)');
    expect(source).toContain('startSelectedCheckout("yearly", false)');
    expect(source).toContain("pendingCheckoutDetails.map");
    expect(source).toContain('t("plans.pendingSelectionTitle")');
    expect(source).toContain('t("plans.pendingSecureCheckout")');
    expect(source).toContain("ShoppingCart");
    expect(source).toContain("ShieldCheck");
  });

  it("renders the richer selected-plan summary without creating another checkout state owner", () => {
    expect(source).toContain("pendingBillingValue");
    expect(source).toContain("pendingCheckoutType");
    expect(source).toContain('t("plans.pendingAccessValue")');
    expect(source).not.toContain("pendingCheckoutUrl");
  });
});
