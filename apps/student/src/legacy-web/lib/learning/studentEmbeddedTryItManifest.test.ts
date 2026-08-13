import {
  SUBJECT_GENERATOR_SOURCES,
} from "@zoeskoul/curriculum-registry/runtime";

import {
  describe,
  expect,
  it,
} from "vitest";

import {
  isEligibleStudentEmbeddedPythonTryIt,
} from "./studentEmbeddedTryItEligibility";

type JsonRecord =
  Record<string, unknown>;

type CanonicalTryItPair = {
  subjectSlug: string;
  topicId: string;
  ownerCardId: string;
  exerciseKey: string;
  exercise: unknown;
};

function record(
  value: unknown,
): JsonRecord | null {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  )
    ? value as JsonRecord
    : null;
}

function stringValue(
  value: unknown,
): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function canonicalTryItInventory() {
  const pairs:
    CanonicalTryItPair[] = [];

  const brokenReferences:
    string[] = [];

  const duplicateExerciseIds:
    string[] = [];

  for (
    const [subjectSlug, source]
    of Object.entries(
      SUBJECT_GENERATOR_SOURCES,
    )
  ) {
    for (
      const [topicId, rawBundle]
      of Object.entries(
        source.topicManifests ?? {},
      )
    ) {
      const bundle =
        record(rawBundle);

      if (!bundle) {
        brokenReferences.push(
          `${subjectSlug}/${topicId}: invalid topic bundle`,
        );
        continue;
      }

      const exercises =
        Array.isArray(bundle.exercises)
          ? bundle.exercises
          : [];

      const byId =
        new Map<string, unknown>();

      for (const value of exercises) {
        const exercise =
          record(value);

        const exerciseId =
          stringValue(
            exercise?.id,
          );

        if (!exerciseId) {
          continue;
        }

        if (byId.has(exerciseId)) {
          duplicateExerciseIds.push(
            `${subjectSlug}/${topicId}/${exerciseId}`,
          );
          continue;
        }

        byId.set(
          exerciseId,
          value,
        );
      }

      const cards =
        Array.isArray(bundle.cards)
          ? bundle.cards
          : [];

      for (const value of cards) {
        const card =
          record(value);

        const tryIt =
          record(card?.tryIt);

        const exerciseKey =
          stringValue(
            tryIt?.exerciseKey,
          );

        if (!exerciseKey) {
          continue;
        }

        const ownerCardId =
          stringValue(
            card?.id,
          );

        const exercise =
          byId.get(
            exerciseKey,
          );

        if (!exercise) {
          brokenReferences.push(
            [
              subjectSlug,
              topicId,
              ownerCardId ||
                "(missing-card-id)",
              exerciseKey,
            ].join("/"),
          );

          continue;
        }

        pairs.push({
          subjectSlug,
          topicId,
          ownerCardId,
          exerciseKey,
          exercise,
        });
      }
    }
  }

  return {
    pairs,
    brokenReferences,
    duplicateExerciseIds,
  };
}

describe(
  "canonical embedded Try It publication",
  () => {
    const inventory =
      canonicalTryItInventory();

    it(
      "resolves every canonical card Try It reference to one exercise",
      () => {
        expect(
          inventory
            .duplicateExerciseIds,
        ).toEqual([]);

        expect(
          inventory
            .brokenReferences,
        ).toEqual([]);

        expect(
          inventory.pairs.length,
        ).toBeGreaterThan(0);
      },
    );

    it(
      "derives Python direct-editor eligibility from canonical bundles",
      () => {
        const pythonPairs =
          inventory.pairs.filter(
            ({ exercise }) => {
              const value =
                record(exercise);

              return (
                stringValue(
                  value?.kind,
                ) === "code_input" &&
                stringValue(
                  value?.purpose,
                ) === "try_it" &&
                stringValue(
                  value?.language,
                ) === "python"
              );
            },
          );

        expect(
          pythonPairs.length,
        ).toBeGreaterThan(0);

        const eligible =
          pythonPairs.filter(
            ({ exercise }) =>
              isEligibleStudentEmbeddedPythonTryIt(
                exercise,
              ),
          );

        expect(
          eligible.length,
        ).toBeGreaterThan(0);

        for (
          const {
            ownerCardId,
            exerciseKey,
            exercise,
          }
          of eligible
        ) {
          const value =
            record(exercise);

          expect(
            ownerCardId,
          ).not.toBe("");

          expect(
            stringValue(
              value?.id,
            ),
          ).toBe(
            exerciseKey,
          );
        }
      },
    );
  },
);
