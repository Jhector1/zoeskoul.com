import {
  describe,
  expect,
  it,
} from "vitest";

import {
  LearningAssignmentInputSchema,
} from "./learningDelivery";

function base() {
  return {
    slug: "python-homework",
    title: "Python homework",
    subjectId: "subject-1",
    status: "assigned" as const,
    groupIds: ["group-1"],
  };
}

describe("LearningAssignmentInputSchema email normalization", () => {
  it("normalizes a copied valid email before validating it", () => {
    const parsed =
      LearningAssignmentInputSchema.parse({
        ...base(),
        userEmails: [
          "  Pharaone04\u200B@GMAIL.COM\uFEFF ",
        ],
      });

    expect(parsed.userEmails).toEqual([
      "pharaone04@gmail.com",
    ]);
  });

  it("still rejects a genuinely malformed email", () => {
    const parsed =
      LearningAssignmentInputSchema.safeParse({
        ...base(),
        userEmails: [
          "bad user@example.com",
        ],
      });

    expect(parsed.success).toBe(false);
  });
});
