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

  it("does not present a structural fill-blank manifest before learner-facing fields are materialized", () => {
    expect(
      resolveCanonicalExercisePresentation({
        exercise: {
          manifest: {
            id:
              "try-singular-ou-fill",
            kind:
              "fill_blank_choice",
            messageBase:
              "topics.example.practice.try-singular-ou-fill",
            choiceCount: 3,
            expected: {
              kind:
                "fill_blank_choice",
              value: "w",
            },
          },
          /*
           * This deliberately reproduces the bug:
           * ReviewRuntime gives even a non-code exercise an empty canonical
           * WorkspaceStateV2. That workspace must not make a structural
           * fill-blank manifest presentation-ready.
           */
          workspace,
          workspaceStatus:
            "ready",
          workspaceGeneration: 4,
        },
        resetRevision: 4,
      }),
    ).toMatchObject({
      status:
        "pending",
      ready: false,
      hasManifest: true,
      hasWorkspace: true,
    });
  });

  it("presents a materialized fill-blank exercise once template and choices exist", () => {
    expect(
      resolveCanonicalExercisePresentation({
        exercise: {
          manifest: {
            id:
              "try-singular-ou-fill",
            kind:
              "fill_blank_choice",
            title:
              "Complete the short form",
            prompt:
              "Complete the contracted singular form.",
            template:
              "pa ___ la",
            choices: [
              "w",
              "m",
              "l",
            ],
          },
          workspace,
          workspaceStatus:
            "ready",
          workspaceGeneration: 4,
        },
        resetRevision: 4,
      }),
    ).toMatchObject({
      status:
        "ready",
      ready: true,
      hasManifest: true,
      hasWorkspace: true,
    });
  });

  it("presents a materialized single-choice exercise with title-only learner copy", () => {
    expect(
      resolveCanonicalExercisePresentation({
        exercise: {
          manifest: {
            kind: "single_choice",
            title: "Try it yourself: Choose the article for kiyé",
            prompt: "",
            options: ["a", "la"],
          },
          workspace,
          workspaceStatus: "ready",
          workspaceGeneration: 9,
        },
        resetRevision: 9,
      }),
    ).toMatchObject({
      status: "ready",
      ready: true,
      generationCurrent: true,
      hasManifest: true,
      hasWorkspace: true,
    });
  });

  it("presents a materialized single-choice exercise without a workspace", () => {
    expect(
      resolveCanonicalExercisePresentation({
        exercise: {
          manifest: {
            kind: "single_choice",
            title: "Choose the article for kiyé",
            prompt: "",
            options: ["a", "la"],
          },
          workspaceStatus: "pending",
          workspaceGeneration: 9,
        },
        resetRevision: 9,
      }),
    ).toMatchObject({
      status: "ready",
      ready: true,
      generationCurrent: true,
      hasManifest: true,
      hasWorkspace: false,
    });
  });

  it("presents a materialized word-bank exercise without a workspace", () => {
    expect(
      resolveCanonicalExercisePresentation({
        exercise: {
          manifest: {
            kind: "word_bank_arrange",
            title: "Build the phrase",
            prompt: "",
            targetText: "a radyo",
          },
          workspaceStatus: "pending",
          workspaceGeneration: 10,
        },
        resetRevision: 10,
      }),
    ).toMatchObject({
      status: "ready",
      ready: true,
      generationCurrent: true,
      hasManifest: true,
      hasWorkspace: false,
    });
  });

  it("does not present non-code content with no learner-facing title or prompt", () => {
    expect(
      resolveCanonicalExercisePresentation({
        exercise: {
          manifest: {
            kind: "single_choice",
            title: "",
            prompt: "",
            options: ["a", "la"],
          },
          workspace,
          workspaceStatus: "ready",
          workspaceGeneration: 9,
        },
        resetRevision: 9,
      }),
    ).toMatchObject({
      status: "pending",
      ready: false,
      hasManifest: true,
      hasWorkspace: true,
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
