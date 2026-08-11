import { describe, expect, it } from "vitest";

import { resolveReviewFreeNavigation } from "./reviewFreeNavigation";

describe("resolveReviewFreeNavigation", () => {
  it("unlocks nested navigation for admin/Draft QA unlock-all surfaces", () => {
    expect(
      resolveReviewFreeNavigation({
        unlockAll: true,
        usesProgressGating: true,
      }),
    ).toBe(true);
  });

  it("keeps ordinary learner navigation gated", () => {
    expect(
      resolveReviewFreeNavigation({
        unlockAll: false,
        usesProgressGating: true,
      }),
    ).toBe(false);
  });

  it("preserves capability-owned free navigation", () => {
    expect(
      resolveReviewFreeNavigation({
        unlockAll: false,
        usesProgressGating: false,
      }),
    ).toBe(true);
  });

  it("remains free when both bypasses apply", () => {
    expect(
      resolveReviewFreeNavigation({
        unlockAll: true,
        usesProgressGating: false,
      }),
    ).toBe(true);
  });
});
