import { describe, expect, it } from "vitest";

import {
  shouldApplyDeferredReviewCodeInputUnregister,
  shouldScheduleReviewCodeInputUnregister,
} from "./codeInputUnregisterPolicy";

describe("Review code-input unregister ownership", () => {
  it("does not schedule cleanup after reset already discarded the registration", () => {
    expect(shouldScheduleReviewCodeInputUnregister(undefined)).toBe(false);
    expect(shouldScheduleReviewCodeInputUnregister(null)).toBe(false);
  });

  it("schedules ordinary cleanup for a still-owned registration", () => {
    expect(shouldScheduleReviewCodeInputUnregister({ id: "exercise-a" })).toBe(
      true,
    );
  });

  it("applies deferred cleanup only while the captured registration still owns the id", () => {
    const registration = { id: "exercise-a", generation: 0 };

    expect(
      shouldApplyDeferredReviewCodeInputUnregister({
        capturedRegistration: registration,
        currentRegistration: registration,
      }),
    ).toBe(true);
  });

  it("rejects a stale deferred cleanup after the id is cleared or re-registered", () => {
    const oldRegistration = { id: "exercise-a", generation: 0 };
    const newRegistration = { id: "exercise-a", generation: 1 };

    expect(
      shouldApplyDeferredReviewCodeInputUnregister({
        capturedRegistration: oldRegistration,
        currentRegistration: undefined,
      }),
    ).toBe(false);

    expect(
      shouldApplyDeferredReviewCodeInputUnregister({
        capturedRegistration: oldRegistration,
        currentRegistration: newRegistration,
      }),
    ).toBe(false);
  });
});
