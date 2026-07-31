import {
  describe,
  expect,
  it,
} from "vitest";

import {
  isStandalonePracticeCodeExercise,
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
  },
);
