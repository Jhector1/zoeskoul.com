import {
  describe,
  expect,
  it,
} from "vitest";

import {
  preserveLearnerFacingExerciseCopy,
} from "./learnerFacingExerciseCopy";

describe(
  "preserveLearnerFacingExerciseCopy",
  () => {
    it(
      "keeps runtime validation but restores the authored prompt",
      () => {
        const result =
          preserveLearnerFacingExerciseCopy({
            runtimeExercise: {
              id: "call-shout",
              kind: "code_input",
              title: "",
              prompt: "",
              starterCode:
                "# Print shout('go') and shout('team')",
              sourceChecks: [
                {
                  type:
                    "source_contains",
                  message:
                    "Use two print calls.",
                },
              ],
            },
            authoredExercise: {
              id: "call-shout",
              kind: "code_input",
              title:
                "Call a function twice",
              prompt:
                "Call shout with 'go' and 'team', then print each returned value on its own line.",
            },
          });

        expect(result).toMatchObject({
          title:
            "Call a function twice",
          prompt:
            "Call shout with 'go' and 'team', then print each returned value on its own line.",
          sourceChecks: [
            {
              type:
                "source_contains",
              message:
                "Use two print calls.",
            },
          ],
        });
      },
    );

    it(
      "does not display a source-check message as the exercise prompt",
      () => {
        const result =
          preserveLearnerFacingExerciseCopy({
            runtimeExercise: {
              id: "return-value",
              prompt:
                "Call print around the returned value.",
              sourceChecks: [
                {
                  message:
                    "Call print around the returned value.",
                },
              ],
            },
            authoredExercise: {
              id: "return-value",
              prompt:
                "Call make_message('Ava') and print the value returned by the function.",
            },
          });

        expect(result?.prompt).toBe(
          "Call make_message('Ava') and print the value returned by the function.",
        );
      },
    );

    it(
      "prefers a resolved project-step prompt over runtime metadata",
      () => {
        const result =
          preserveLearnerFacingExerciseCopy({
            runtimeExercise: {
              id: "project-step",
              title: "@:missing.title",
              prompt: "@:missing.prompt",
              sourceChecks: [
                {
                  message:
                    "@:checks.0.message",
                },
              ],
            },
            authoredExercise: {
              id: "project-step",
              title: "",
              prompt: "",
            },
            projectManifest: {
              title:
                "Build the formatter",
              prompt:
                "Complete the formatter function and call it with the two required values.",
            },
          });

        expect(result).toMatchObject({
          title:
            "Build the formatter",
          prompt:
            "Complete the formatter function and call it with the two required values.",
        });
      },
    );

    it(
      "keeps a valid runtime prompt when no authored copy exists",
      () => {
        const result =
          preserveLearnerFacingExerciseCopy({
            runtimeExercise: {
              id: "generated",
              prompt:
                "Write a function that returns the doubled number.",
            },
          });

        expect(result?.prompt).toBe(
          "Write a function that returns the doubled number.",
        );
      },
    );
  },
);
