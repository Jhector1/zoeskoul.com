import {
  describe,
  expect,
  it,
} from "vitest";

import {
  buildReviewFromManifest,
} from "@zoeskoul/curriculum-runtime/compat/buildReviewFromManifest";

describe(
  "buildReviewFromManifest student runtime quiz selector",
  () => {
    it(
      "carries the migration-only selector without changing the legacy quiz pool",
      () => {
        const built =
          buildReviewFromManifest({
            manifest: {
              prefix:
                "topics.python-v2.python-v2-0",
              topicId:
                "what-python-is",
              subjectSlug:
                "python-v2",
              moduleSlug:
                "python-v2-0",
              sectionSlug:
                "python-v2-0-introduction",
              minutes: 5,
              topic: {
                labelKey:
                  "topic.label",
                summaryKey:
                  "topic.summary",
              },
              cards: [
                {
                  id: "quiz",
                  kind: "quiz",
                  titleKey:
                    "quiz.title",
                  studentRuntimeExerciseKey:
                    "sc-python-use-general",
                  quiz: {
                    difficulty:
                      "easy",
                    n: 4,
                    min: 4,
                    max: 4,
                    selectionMode:
                      "random",
                    allowReveal:
                      true,
                    preferKind:
                      null,
                  },
                },
              ],
              sketches: [],
              exercises: [
                {
                  id:
                    "sc-python-use-general",
                  kind:
                    "single_choice",
                  purpose:
                    "quiz",
                },
                {
                  id:
                    "sc-python-use-second",
                  kind:
                    "single_choice",
                  purpose:
                    "quiz",
                },
                {
                  id:
                    "mc-python-use-third",
                  kind:
                    "multi_choice",
                  purpose:
                    "quiz",
                },
                {
                  id:
                    "num-python-use-fourth",
                  kind:
                    "numeric",
                  purpose:
                    "quiz",
                },
              ],
            } as never,
            pool: [],
          });

        const card =
          built.topic.cards[0];

        expect(card).toMatchObject({
          type: "quiz",
          studentRuntimeExerciseKey:
            "sc-python-use-general",
          spec: {
            exerciseKeys: [
              "sc-python-use-general",
              "sc-python-use-second",
              "mc-python-use-third",
              "num-python-use-fourth",
            ],
            n: 4,
          },
        });

        expect(
          (
            card as {
              spec?: {
                selectionMode?: string;
              };
            }
          ).spec?.selectionMode,
        ).toBe("random");
      },
    );
  },
);
