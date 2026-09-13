import { describe, expect, it } from "vitest";

import {
  resolveReviewToolsMountedWorkspaceAfterBind,
} from "./reviewToolsMountedWorkspacePolicy";

describe("resolveReviewToolsMountedWorkspaceAfterBind", () => {
  it("prefers the canonical runtime learner workspace over a stale saved registry snapshot", () => {
    const staleRegistryWorkspace = { marker: "923" };
    const runtimeWorkspace = { marker: "928" };

    expect(
      resolveReviewToolsMountedWorkspaceAfterBind({
        boundWorkspace: staleRegistryWorkspace,
        boundOrigin: "saved",
        boundGeneration: 0,
        runtimeExercise: {
          workspace: runtimeWorkspace,
          workspaceOrigin: "user",
          userEdited: true,
          workspaceGeneration: 0,
        },
      }),
    ).toEqual({
      workspace: runtimeWorkspace,
      generation: 0,
      applyToMountedEditor: true,
    });
  });

  it("uses a saved registry workspace when runtime does not own learner work", () => {
    const boundWorkspace = { marker: "saved" };

    expect(
      resolveReviewToolsMountedWorkspaceAfterBind({
        boundWorkspace,
        boundOrigin: "saved",
        boundGeneration: 2,
        runtimeExercise: {
          workspace: { marker: "starter" },
          workspaceOrigin: "starter",
          userEdited: false,
          workspaceGeneration: 2,
        },
      }),
    ).toEqual({
      workspace: boundWorkspace,
      generation: 2,
      applyToMountedEditor: false,
    });
  });

  it("does not mount a passive starter snapshot through the learner-work bind path", () => {
    expect(
      resolveReviewToolsMountedWorkspaceAfterBind({
        boundWorkspace: { marker: "starter" },
        boundOrigin: "starter",
        boundGeneration: 0,
        runtimeExercise: null,
      }),
    ).toBeNull();
  });

  it("uses the runtime workspace generation when canonical learner work wins", () => {
    const runtimeWorkspace = { marker: "saved" };

    expect(
      resolveReviewToolsMountedWorkspaceAfterBind({
        boundWorkspace: { marker: "old" },
        boundOrigin: "saved",
        boundGeneration: 1,
        runtimeExercise: {
          codeWorkspace: runtimeWorkspace,
          workspaceOrigin: "saved",
          userEdited: true,
          workspaceGeneration: 3,
        },
      }),
    ).toEqual({
      workspace: runtimeWorkspace,
      generation: 3,
      applyToMountedEditor: true,
    });
  });
});
