import {
  describe,
  expect,
  it,
} from "vitest";

import {
  isStandalonePracticeCodeExercise,
  isStandalonePracticeToolBindingPending,
  shouldShowStandalonePracticeCodeTool,
} from "../legacy-web/components/practice/tools/useStandalonePracticeTools";

describe(
  "standalone practice tool visibility",
  () => {
    it(
      "shows the editor for code-input questions",
      () => {
        expect(
          isStandalonePracticeCodeExercise(
            "code_input",
          ),
        ).toBe(true);
      },
    );

    it.each([
      "fill_blank_choice",
      "single_choice",
      "multi_choice",
      "ordering",
    ])(
      "hides the editor for %s",
      (kind) => {
        expect(
          shouldShowStandalonePracticeCodeTool({
            busy: false,
            exerciseKind: kind,
          }),
        ).toBe(false);
      },
    );

    it(
      "keeps the tools surface available only while an exercise is loading",
      () => {
        expect(
          shouldShowStandalonePracticeCodeTool({
            busy: true,
            exerciseKind: null,
          }),
        ).toBe(true);
      },
    );

    it(
      "does not block a resolved practice editor while formal binding is absent",
      () => {
        expect(
          isStandalonePracticeToolBindingPending({
            codeToolEnabled: true,
            busy: false,
            hasExercise: true,
            hasCurrent: true,
            boundId: null,
            exerciseStateKey: "practice:python:exercise-1",
          }),
        ).toBe(false);
      },
    );

    it(
      "keeps waiting while the active exercise contract is unresolved",
      () => {
        expect(
          isStandalonePracticeToolBindingPending({
            codeToolEnabled: true,
            busy: true,
            hasExercise: false,
            hasCurrent: false,
            boundId: null,
            exerciseStateKey: "practice:python:exercise-1",
          }),
        ).toBe(true);
      },
    );

    it(
      "does not block a resolved editor on a stale previous-exercise binding",
      () => {
        expect(
          isStandalonePracticeToolBindingPending({
            codeToolEnabled: true,
            busy: false,
            hasExercise: true,
            hasCurrent: true,
            boundId: "practice:python:exercise-0",
            exerciseStateKey: "practice:python:exercise-1",
          }),
        ).toBe(false);
      },
    );

    it(
      "clears the pending state when Tools is bound to the current exercise",
      () => {
        expect(
          isStandalonePracticeToolBindingPending({
            codeToolEnabled: true,
            busy: false,
            hasExercise: true,
            hasCurrent: true,
            boundId: "practice:python:exercise-1",
            exerciseStateKey: "practice:python:exercise-1",
          }),
        ).toBe(false);
      },
    );
  },
);
