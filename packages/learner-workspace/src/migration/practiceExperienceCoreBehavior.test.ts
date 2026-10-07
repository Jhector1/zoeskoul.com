import { describe, expect, it } from "vitest";

import {
  getPracticeExperienceRuntimePolicy,
  isPracticeExperienceAllowedOnSurface,
  resolvePracticeSurfaceMode,
  shouldResumePracticeFromServer,
} from "../practice/experience/routePolicy";
import {
  resolvePracticeExerciseSurface,
  usesPracticeToolsSurface,
} from "../practice/experience/surface";
import {
  countdownParts,
  isLessonPracticeReturnUrl,
  nextUtcDayStartIso,
  resolvePracticeCompletionIntent,
  shouldReturnToLessonAfterModulePractice,
} from "../practice/experience/completion";

describe("shared Practice experience core behavior", () => {
  it("preserves route and runtime policy", () => {
    expect(
      isPracticeExperienceAllowedOnSurface({
        surface: "daily_practice",
        mode: "daily_five",
      }),
    ).toBe(true);

    expect(
      isPracticeExperienceAllowedOnSurface({
        surface: "daily_practice",
        mode: "assignment",
      }),
    ).toBe(false);

    expect(
      resolvePracticeSurfaceMode({
        surface: "module_practice",
        requestedAssignment: true,
      }),
    ).toBe("assignment");

    expect(shouldResumePracticeFromServer("standard")).toBe(true);
    expect(shouldResumePracticeFromServer("practice")).toBe(false);

    expect(
      getPracticeExperienceRuntimePolicy("assignment").workspace,
    ).toBe("embedded");
  });

  it("preserves embedded/tools surface policy", () => {
    expect(
      resolvePracticeExerciseSurface({ mode: "assignment" }),
    ).toBe("embedded");

    expect(
      resolvePracticeExerciseSurface({ mode: "daily_five" }),
    ).toBe("tools");

    expect(
      usesPracticeToolsSurface({ mode: "public_challenge" }),
    ).toBe(true);
  });

  it("preserves completion intent and lesson-return policy", () => {
    expect(
      resolvePracticeCompletionIntent({
        mode: "daily_five",
        viewer: {
          tier: "subscriber",
          authenticated: true,
          subscribed: true,
        },
      }),
    ).toBe("daily_subscriber");

    expect(
      resolvePracticeCompletionIntent({
        mode: "public_challenge",
        viewer: {
          tier: "guest",
          authenticated: false,
          subscribed: false,
        },
      }),
    ).toBe("challenge_guest");

    const returnUrl =
      "/en/subjects/python/modules/basics/learn";

    expect(isLessonPracticeReturnUrl(returnUrl)).toBe(true);

    expect(
      shouldReturnToLessonAfterModulePractice({
        mode: "standard",
        returnUrl,
      }),
    ).toBe(true);

    expect(
      shouldReturnToLessonAfterModulePractice({
        mode: "practice",
        returnUrl,
      }),
    ).toBe(false);
  });

  it("preserves UTC reset/countdown helpers", () => {
    expect(nextUtcDayStartIso("2026-10-04")).toBe(
      "2026-10-05T00:00:00.000Z",
    );
    expect(nextUtcDayStartIso("not-a-day")).toBeNull();

    const parts = countdownParts(
      "2026-10-05T01:02:03.000Z",
      Date.parse("2026-10-05T00:00:00.000Z"),
    );

    expect(parts.ready).toBe(false);
    expect(parts.hours).toBe(1);
    expect(parts.minutes).toBe(2);
    expect(parts.seconds).toBe(3);
  });
});
