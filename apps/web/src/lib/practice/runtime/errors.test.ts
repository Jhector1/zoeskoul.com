import { describe, expect, it } from "vitest";
import { isRecoverablePracticeKeyError } from "./errors";

describe("isRecoverablePracticeKeyError", () => {
  it("accepts structured 401 practice request errors", () => {
    expect(
      isRecoverablePracticeKeyError({ status: 401, message: "Unauthorized" }),
    ).toBe(true);
  });

  it("keeps compatibility with the current invalid-key response message", () => {
    expect(isRecoverablePracticeKeyError(new Error("Invalid or expired key."))).toBe(true);
  });

  it("does not retry unrelated failures", () => {
    expect(isRecoverablePracticeKeyError({ status: 500, message: "Database failed" })).toBe(false);
  });
});
