import { describe, expect, it } from "vitest";
import { resolveTutoringReviewWorkspaceCapabilities } from "./workspaceCapabilities";

describe("tutoring review workspace capabilities", () => {
  it("makes a tutor's learner view observational and ungated", () => {
    expect(
      resolveTutoringReviewWorkspaceCapabilities({
        canManage: true,
        canEdit: false,
        workspaceView: "learner",
      }),
    ).toEqual({
      canEditWorkspace: false,
      canSubmitPractice: false,
      canMutateProgress: false,
      usesProgressGating: false,
    });
  });

  it("keeps a learner's private workspace editable and gated", () => {
    expect(
      resolveTutoringReviewWorkspaceCapabilities({
        canManage: false,
        canEdit: true,
        workspaceView: "mine",
      }),
    ).toEqual({
      canEditWorkspace: true,
      canSubmitPractice: true,
      canMutateProgress: true,
      usesProgressGating: true,
    });
  });

  it("lets tutor master authoring navigate freely", () => {
    expect(
      resolveTutoringReviewWorkspaceCapabilities({
        canManage: true,
        canEdit: true,
        workspaceView: "master",
      }).usesProgressGating,
    ).toBe(false);
  });
});
