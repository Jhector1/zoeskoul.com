import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/legacy-web/components/review/QuizBlock.tsx"),
  "utf8",
);

function topLevelCanonicalSlice() {
  const start = source.indexOf(
    "const transitionCanonicalExerciseOwnerKey = useReviewRuntimeStore",
  );
  const end = source.indexOf(
    "useEffect(() => {\n    local.hydrate(initState);",
    start,
  );

  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

function nestedTransitionSlice() {
  const start = source.indexOf(
    "void transitionRuntimePresentationRevision;",
  );
  const end = source.indexOf(
    "const canAutoBindToolsForExercise =",
    start,
  );

  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("QuizBlock canonical exercise transition presentation", () => {
  it("subscribes at component level to the canonical bound/runtime owner", () => {
    const slice = topLevelCanonicalSlice();

    expect(slice).toContain("resolveCanonicalExerciseOwnerKey({");
    expect(slice).toContain(
      "boundExerciseKey: state.tool.boundExerciseKey",
    );
    expect(slice).toContain(
      "activeExerciseKey: state.activeExerciseKey",
    );
    expect(slice).toContain(
      "state.exercises[transitionCanonicalExerciseOwnerKey]",
    );
    expect(slice).toContain(
      "resolveCanonicalExercisePresentation({",
    );
  });

  it("keeps q.fetch/getRuntimePracticePatchForQuestion out of transition presentation", () => {
    const slice = nestedTransitionSlice();

    expect(slice).not.toContain("q.fetch");
    expect(slice).not.toContain("getRuntimePracticePatchForQuestion");
    expect(slice).not.toContain("__runtimeStoreKey");
    expect(slice).toContain(
      "Boolean(transitionCanonicalExercisePresentation?.ready)",
    );
  });

  it("uses the canonical exercise key as the boundary owner", () => {
    expect(source).toContain(
      "transitionCanonicalExerciseOwnerKey || stablePracticeKey",
    );
    expect(source).toContain("ready={transitionQuestionReady}");
  });

  it("does not put Zustand hooks inside renderQuestionItem", () => {
    const renderStart = source.indexOf(
      "function renderQuestionItem(q: ReviewQuestion, idx: number)",
    );
    const renderEnd = source.indexOf(
      "const canAutoBindToolsForExercise =",
      renderStart,
    );
    const renderPrefix = source.slice(renderStart, renderEnd);

    expect(renderPrefix).not.toContain(
      "const transitionCanonicalExerciseOwnerKey = useReviewRuntimeStore",
    );
  });
});
