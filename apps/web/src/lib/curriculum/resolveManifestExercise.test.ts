import { describe, expect, it } from "vitest";
import { resolveManifestExercise } from "@/lib/curriculum/resolveManifestExercise";

describe("resolveManifestExercise", () => {
  it("returns the exact authored exercise from the topic bundle", () => {
    const exercise = resolveManifestExercise({
      topicBundle: {
        topicId: "using-imports-and-helper-files",
        exercises: [
          { id: "q1", kind: "single_choice" },
          { id: "using-imports-build-report-module", kind: "code_input" },
        ],
      },
      exerciseKey: "using-imports-build-report-module",
    });

    expect(exercise).toMatchObject({
      id: "using-imports-build-report-module",
      kind: "code_input",
    });
  });

  it("throws loudly when a project step points at a missing authored exercise", () => {
    expect(() =>
      resolveManifestExercise({
        topicBundle: {
          topicId: "using-imports-and-helper-files",
          exercises: [{ id: "q1", kind: "single_choice" }],
        },
        exerciseKey: "missing-step-exercise",
      }),
    ).toThrow(
      'Project step points to missing exerciseKey "missing-step-exercise" in topic "using-imports-and-helper-files".',
    );
  });
});
