import { describe, expect, it } from "vitest";

import {
  shouldPreserveProtectedReviewCodeInputRegistration,
  type ReviewCodeInputRegistrationContent,
} from "./codeInputRegistrationConflictPolicy";

const content = (code: string): ReviewCodeInputRegistrationContent => ({
  code,
  stdin: "",
  language: "python",
  workspaceKey: `workspace:${code}`,
});

describe("shouldPreserveProtectedReviewCodeInputRegistration", () => {
  it("preserves learner work when a passive re-registration falsely claims saved ownership", () => {
    expect(
      shouldPreserveProtectedReviewCodeInputRegistration({
        previousProtected: true,
        previousGeneration: 0,
        incomingGeneration: 0,
        activeGeneration: 0,
        incomingClaimsLearnerOwnership: true,
        previous: content("print('__SAVE_TRACE_929__')"),
        incoming: content("starter"),
        runtime: content("print('__SAVE_TRACE_929__')"),
      }),
    ).toBe(true);
  });

  it("accepts incoming content when canonical runtime uniquely agrees with it", () => {
    expect(
      shouldPreserveProtectedReviewCodeInputRegistration({
        previousProtected: true,
        previousGeneration: 0,
        incomingGeneration: 0,
        activeGeneration: 0,
        incomingClaimsLearnerOwnership: true,
        previous: content("older learner work"),
        incoming: content("newer hydrated work"),
        runtime: content("newer hydrated work"),
      }),
    ).toBe(false);
  });

  it("preserves protected work when runtime is temporarily unavailable", () => {
    expect(
      shouldPreserveProtectedReviewCodeInputRegistration({
        previousProtected: true,
        previousGeneration: 0,
        incomingGeneration: 0,
        activeGeneration: 0,
        incomingClaimsLearnerOwnership: true,
        previous: content("learner work"),
        incoming: content("starter"),
        runtime: null,
      }),
    ).toBe(true);
  });

  it("does not interfere when the previous registration is not protected learner work", () => {
    expect(
      shouldPreserveProtectedReviewCodeInputRegistration({
        previousProtected: false,
        previousGeneration: 0,
        incomingGeneration: 0,
        activeGeneration: 0,
        incomingClaimsLearnerOwnership: false,
        previous: content("starter"),
        incoming: content("hydrated"),
        runtime: content("hydrated"),
      }),
    ).toBe(false);
  });

  it("keeps an equivalent protected registration stable", () => {
    expect(
      shouldPreserveProtectedReviewCodeInputRegistration({
        previousProtected: true,
        previousGeneration: 0,
        incomingGeneration: 0,
        activeGeneration: 0,
        incomingClaimsLearnerOwnership: true,
        previous: content("same"),
        incoming: content("same"),
        runtime: content("same"),
      }),
    ).toBe(true);
  });
  it("does not protect pre-reset learner work after generation advances", () => {
    expect(shouldPreserveProtectedReviewCodeInputRegistration({
      previousProtected: true,
      previousGeneration: 0,
      incomingGeneration: undefined,
      activeGeneration: 1,
      incomingClaimsLearnerOwnership: false,
      previous: content("learner before reset"),
      incoming: content("starter after reset"),
      runtime: null,
    })).toBe(false);
  });

  it("does not trust unversioned protected work after reset", () => {
    expect(shouldPreserveProtectedReviewCodeInputRegistration({
      previousProtected: true,
      previousGeneration: undefined,
      incomingGeneration: undefined,
      activeGeneration: 2,
      incomingClaimsLearnerOwnership: true,
      previous: content("legacy learner work"),
      incoming: content("starter"),
      runtime: null,
    })).toBe(false);
  });

});
