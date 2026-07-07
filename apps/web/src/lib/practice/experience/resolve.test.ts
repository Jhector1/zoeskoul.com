import { describe, expect, it } from "vitest";

import {
  assertPracticeExperienceInvariant,
  resolvePracticeExperienceMode,
} from "./resolve";

describe("practice experience resolution", () => {
  it("uses explicit persisted modes", () => {
    expect(resolvePracticeExperienceMode({ id: "s1", mode: "daily_five" })).toBe(
      "daily_five",
    );
    expect(
      resolvePracticeExperienceMode({
        id: "s2",
        mode: "assignment",
        assignmentId: "a1",
      }),
    ).toBe("assignment");
  });

  it("keeps legacy assignment and challenge rows readable during migration", () => {
    expect(
      resolvePracticeExperienceMode({
        id: "legacy-assignment",
        mode: "standard",
        assignmentId: "a1",
      }),
    ).toBe("assignment");

    expect(
      resolvePracticeExperienceMode({
        id: "legacy-challenge",
        mode: "onboarding_trial",
        meta: {
          kind: "shared_challenge",
          challengeId: "c1",
          subjectSlug: "python",
          moduleSlug: "python-1",
          sectionSlug: "basics",
          topicSlug: "variables",
          exerciseKey: "ci-variable",
          exerciseTitle: "Variable",
          exercisePurpose: "quiz",
          maxAttempts: 3,
          locale: "en",
        },
      }),
    ).toBe("public_challenge");
  });


  it("treats review module assignments as assignment intent", () => {
    const session = {
      id: "module-assignment",
      mode: "standard",
      assignmentId: null,
      meta: { kind: "module_assignment", moduleSlug: "python-v2-0" },
    };

    expect(resolvePracticeExperienceMode(session)).toBe("assignment");
    expect(() => assertPracticeExperienceInvariant(session)).not.toThrow();
  });

  it("rejects assignment rows without assignment identity", () => {
    expect(() =>
      assertPracticeExperienceInvariant({ id: "bad", mode: "assignment" }),
    ).toThrow(/assignmentId/i);
  });
});
