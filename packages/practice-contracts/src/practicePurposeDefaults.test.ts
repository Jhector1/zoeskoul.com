import { describe, expect, it } from "vitest";

import { resolvePracticePurposeDefaults } from "./practicePurposeDefaults.js";

describe("shared Practice purpose defaults", () => {
  it.each(["standard", "practice", "daily_five"])(
    "keeps %s on strict authored practice purpose",
    (experienceMode) => {
      expect(
        resolvePracticePurposeDefaults({
          experienceMode,
          requestedPurpose: "project",
          requestedPolicy: "fallback",
          isLockedRun: true,
        }),
      ).toEqual({
        preferPurpose: "practice",
        purposePolicy: "strict",
      });
    },
  );

  it("keeps other locked experiences on the existing quiz fallback", () => {
    expect(
      resolvePracticePurposeDefaults({
        experienceMode: "assignment",
        requestedPurpose: "project",
        requestedPolicy: "strict",
        isLockedRun: true,
      }),
    ).toEqual({
      preferPurpose: "quiz",
      purposePolicy: "fallback",
    });
  });

  it("preserves explicit defaults for unlocked non-Practice experiences", () => {
    expect(
      resolvePracticePurposeDefaults({
        experienceMode: "public_challenge",
        requestedPurpose: "project",
        requestedPolicy: "strict",
        isLockedRun: false,
      }),
    ).toEqual({
      preferPurpose: "project",
      purposePolicy: "strict",
    });
  });
});
