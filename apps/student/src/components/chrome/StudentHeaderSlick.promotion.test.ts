import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readSource = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

describe("StudentHeaderSlick billing promotion", () => {
  it("renders canonical billing promotions on desktop and mobile", () => {
    const source = readSource("./StudentHeaderSlick.tsx");

    expect(source).toContain("status: billingStatus");
    expect(source).toContain("activePromotions?.monthly");
    expect(source).toContain("activePromotions?.yearly");
    expect(source).toContain("BillingPromotionCountdown");
    expect(source.match(/headerPromotions\.map/g)).toHaveLength(2);
    expect(source).toContain('billingT("promotion.headerLabel")');
  });

  it("keeps promotion countdown math shared with Web", () => {
    const studentCountdown = readSource(
      "../../legacy-web/components/billing/BillingPromotionCountdown.tsx",
    );
    const webCountdown = readFileSync(
      new URL(
        "../../../../web/src/components/billing/BillingPromotionCountdown.tsx",
        import.meta.url,
      ),
      "utf8",
    );

    for (const source of [studentCountdown, webCountdown]) {
      expect(source).toContain(
        "@zoeskoul/learner-ui/lib/billing/promotionCountdown",
      );
      expect(source).toContain(
        "formatPromotionCountdown(countdown.remainingMs)",
      );
    }
  });
});
