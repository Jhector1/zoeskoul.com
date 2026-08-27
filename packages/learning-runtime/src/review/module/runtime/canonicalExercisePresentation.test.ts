import { describe, expect, it } from "vitest";
import {
  resolveCanonicalExercisePresentation,
} from "./canonicalExercisePresentation";

const workspace = {
  version: 2,
  language: "python",
  nodes: [],
};

describe("canonical exercise presentation", () => {
  it("renders from current manifest + canonical workspace even if a stale transport wrote pending", () => {
    expect(
      resolveCanonicalExercisePresentation({
        exercise: {
          manifest: { kind: "code_input" },
          workspace,
          workspaceStatus: "pending",
          workspaceGeneration: 7,
        },
        resetRevision: 7,
      }),
    ).toMatchObject({
      status: "ready",
      ready: true,
      generationCurrent: true,
      hasManifest: true,
      hasWorkspace: true,
    });
  });

  it("never presents a stale workspace from a previous reset generation", () => {
    expect(
      resolveCanonicalExercisePresentation({
        exercise: {
          manifest: { kind: "code_input" },
          workspace,
          workspaceStatus: "ready",
          workspaceGeneration: 6,
        },
        resetRevision: 7,
      }),
    ).toMatchObject({
      status: "pending",
      ready: false,
      generationCurrent: false,
    });
  });

  it("treats a hard workspace error as blocking only when no canonical workspace exists", () => {
    expect(
      resolveCanonicalExercisePresentation({
        exercise: {
          manifest: { kind: "code_input" },
          workspaceStatus: "error",
          workspaceGeneration: 3,
          workspaceError: "starter failed",
        },
        resetRevision: 3,
      }),
    ).toMatchObject({
      status: "error",
      ready: false,
      error: "starter failed",
    });

    expect(
      resolveCanonicalExercisePresentation({
        exercise: {
          manifest: { kind: "code_input" },
          workspace,
          workspaceStatus: "error",
          workspaceGeneration: 3,
          workspaceError: "stale transport error",
        },
        resetRevision: 3,
      }),
    ).toMatchObject({
      status: "ready",
      ready: true,
      error: null,
    });
  });

  it("requires authored manifest ownership as well as workspace ownership", () => {
    expect(
      resolveCanonicalExercisePresentation({
        exercise: {
          workspace,
          workspaceStatus: "ready",
          workspaceGeneration: 1,
        },
        resetRevision: 1,
      }),
    ).toMatchObject({
      status: "pending",
      ready: false,
      hasManifest: false,
      hasWorkspace: true,
    });
  });
});
