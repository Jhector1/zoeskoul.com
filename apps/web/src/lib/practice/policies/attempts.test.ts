import { afterEach, describe, expect, it } from "vitest";

import { computeMaxAttemptsCore } from "./attempts";

const envNames = [
  "ASSIGNMENT_QUESTION_DEFAULT_MAX_ATTEMPTS",
  "SESSION_DEFAULT_MAX_ATTEMPTS",
  "PRACTICE_DEFAULT_MAX_ATTEMPTS",
] as const;

afterEach(() => {
  for (const name of envNames) delete process.env[name];
});

describe("attempt policy", () => {
  it("keeps assignment question attempts separate from whole assignment runs", () => {
    expect(
      computeMaxAttemptsCore({
        mode: "assignment",
        assignmentQuestionMaxAttempts: 4,
      }),
    ).toBe(4);

    process.env.ASSIGNMENT_QUESTION_DEFAULT_MAX_ATTEMPTS = "2";
    expect(computeMaxAttemptsCore({ mode: "assignment" })).toBe(2);
  });

  it.each(["public_challenge", "daily_five"] as const)(
    "keeps %s unlimited even when old metadata has a cap",
    (mode) => {
      expect(computeMaxAttemptsCore({ mode })).toBeNull();
      expect(
        computeMaxAttemptsCore({
          mode,
          sessionMaxAttempts: 2,
        }),
      ).toBeNull();
    },
  );

  it("keeps onboarding trial on the finite session cap", () => {
    expect(computeMaxAttemptsCore({ mode: "onboarding_trial" })).toBe(3);
    expect(
      computeMaxAttemptsCore({
        mode: "onboarding_trial",
        sessionMaxAttempts: 2,
      }),
    ).toBe(2);
  });

  it("keeps subscriber and ad-hoc practice unlimited by default", () => {
    expect(computeMaxAttemptsCore({ mode: "standard" })).toBeNull();
    expect(computeMaxAttemptsCore({ mode: "practice" })).toBeNull();
  });
});
