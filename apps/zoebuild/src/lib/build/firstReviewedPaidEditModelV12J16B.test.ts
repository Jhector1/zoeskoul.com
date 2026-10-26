import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const reviews = vi.hoisted(() => ({ resolve: vi.fn() }));
vi.mock("./reviewedAiBillingRegistry", () => ({
  resolveProductionZoeBuildBillingProfile: reviews.resolve,
}));
import { resolveFirstReviewedPaidEditModel, ZoeBuildPaidEditSelectionError } from "./firstReviewedPaidEditModelV12J16B";

const originalKey = process.env.OPENAI_API_KEY;
const policy = Object.freeze({
  maxCombinedInputTokens: 20_000,
  maxOutputTokens: 4_096,
  maxBillableOutputTokens: 4_096,
  evidence: { provider: "openai", model: "gpt-6-luna" },
});

describe("V12J.16B paid-edit model selection", () => {
  beforeEach(() => {
    reviews.resolve.mockReset();
    process.env.OPENAI_API_KEY = "unit-test-placeholder-not-a-real-key";
  });
  afterEach(() => {
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  });
  it("fails closed when the compiled billing/operations resolver refuses", () => {
    reviews.resolve.mockImplementation(() => { throw new Error("AI_BILLING_OPERATIONS_NOT_APPROVED"); });
    expect(() => resolveFirstReviewedPaidEditModel()).toThrow("AI_BILLING_OPERATIONS_NOT_APPROVED");
    expect(reviews.resolve).toHaveBeenCalledTimes(1);
  });
  it("asks production resolver for Luna only, never any browser or routing choice", () => {
    reviews.resolve.mockReturnValue(policy);
    expect(resolveFirstReviewedPaidEditModel(new Date("2026-10-23T21:00:00Z")))
      .toEqual({provider:"openai",model:"gpt-6-luna"});
    expect(reviews.resolve).toHaveBeenCalledWith(
      expect.objectContaining({provider:"openai",model:"gpt-6-luna"}),
      new Date("2026-10-23T21:00:00Z"),
    );
  });
  it("rejects an overbroad or unbounded approval before any provider transport", () => {
    for (const override of [
      {maxCombinedInputTokens:20_001}, {maxOutputTokens:4_097},
      {maxBillableOutputTokens:4_097}, {maxCombinedInputTokens:0},
      {evidence:{provider:"openai",model:"gpt-6.1-sol"}},
    ]) {
      reviews.resolve.mockReturnValue({...policy,...override});
      expect(() => resolveFirstReviewedPaidEditModel()).toThrow(ZoeBuildPaidEditSelectionError);
    }
  });
  it("refuses to select a paid provider if its key is missing", () => {
    reviews.resolve.mockReturnValue(policy);
    delete process.env.OPENAI_API_KEY;
    expect(() => resolveFirstReviewedPaidEditModel()).toThrow("AI_PAID_EDIT_PROVIDER_NOT_CONFIGURED");
  });
});
