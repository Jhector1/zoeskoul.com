import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  fileURLToPath(
    new URL(
      "./QuizPracticeCard.tsx",
      import.meta.url,
    ),
  ),
  "utf8",
);

describe("QuizPracticeCard canonical presentation ownership", () => {
  it("reads presentation from the canonical ExerciseRuntime, not editor runtime", () => {
    expect(source).toContain(
      "resolveCanonicalExercisePresentation({",
    );
    expect(source).toContain(
      "exercise: runtimeExercise",
    );
    expect(source).toContain(
      "getWorkspaceFromAnyState(runtimeExercise)",
    );
    expect(source).not.toContain(
      "(s) => s.editorRuntimes[exerciseKeyForTools] ?? null",
    );
  });

  it("never lets practice-network loading write canonical workspace readiness", () => {
    expect(source).not.toContain(
      'updateOrigin: "quiz-practice-status-heal"',
    );
    expect(source).not.toContain(
      'updateOrigin: "quiz-practice-status"',
    );
    expect(source).not.toContain(
      "runtimeEditorWorkspaceReady",
    );
    expect(source).not.toContain(
      "canonicalRuntimeWorkspaceReady",
    );
  });

  it("renders current canonical runtime presentation without waiting for a signed item", () => {
    expect(source).toContain(
      "const canonicalRuntimePresentationReady =",
    );
    expect(source).toContain(
      "canonicalRuntimePresentation.ready",
    );
    expect(source).toContain(
      "canonicalRuntimePresentationReady ||\n      practiceResolvedForToolBinding",
    );
    expect(source).toContain(
      "const hasExercise = Boolean(presentationExercise && presentationItem && practiceResolvedForPresentation)",
    );
  });

  it("keeps Check and Help on the signed validation contract", () => {
    expect(source).toContain(
      "const disableCheck =\n      !practiceResolvedForToolBinding ||",
    );
    expect(source).toContain(
      "const disableHelpAction =\n      !practiceResolvedForToolBinding ||",
    );
    expect(source).toContain("<PracticeHelpPanel");
  });
});
