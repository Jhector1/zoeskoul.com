import {describe, expect, it} from "vitest";
import {formatBuilderBillingAmount} from "./formatBuilderBillingAmount";

describe("Builder subscription amount formatting", () => {
  it("formats two-decimal USD Stripe minor units", () => {
    expect(formatBuilderBillingAmount("en-US", "usd", 1900)).toBe("$19.00");
  });
  it("formats zero-decimal JPY without dividing by 100", () => {
    expect(formatBuilderBillingAmount("en-US", "jpy", 1900)).toBe("¥1,900");
  });
  it("formats three-decimal KWD with full precision", () => {
    expect(formatBuilderBillingAmount("en-US", "kwd", 1234)).toContain("1.234");
  });
  it("rejects invalid amounts instead of displaying them as prices", () => {
    expect(() => formatBuilderBillingAmount("en-US", "usd", NaN)).toThrow();
    expect(() => formatBuilderBillingAmount("en-US", "usd", -1)).toThrow();
  });
});
