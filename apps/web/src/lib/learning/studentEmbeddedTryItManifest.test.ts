import {
  readFileSync,
} from "node:fs";

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

const topicBundleFiles = [
  "python/python-data-functions/modules/module5/topics/creating-and-indexing-lists/topic.bundle.json",
  "python/python-data-functions/modules/module5/topics/list-methods-and-mutation/topic.bundle.json",
  "python/python-data-functions/modules/module5/topics/looping-through-lists/topic.bundle.json",
  "python/python-data-functions/modules/module5/topics/dictionary-basics/topic.bundle.json",
  "python/python-data-functions/modules/module5/topics/updating-and-looping-dictionaries/topic.bundle.json",
  "python/python-data-functions/modules/module5/topics/tuple-records-and-unpacking/topic.bundle.json",
  "python/python-data-functions/modules/module5/topics/nested-data-structures/topic.bundle.json",
  "python/python-data-functions/modules/module5/topics/module-5-workshop-schedule-project/topic.bundle.json",
  "python/python-data-functions/modules/module6/topics/decomposition-and-refactoring/topic.bundle.json",
  "python/python-data-functions/modules/module6/topics/defining-and-calling-functions/topic.bundle.json",
  "python/python-data-functions/modules/module6/topics/docstrings-and-function-contracts/topic.bundle.json",
  "python/python-data-functions/modules/module6/topics/parameters-and-return-values/topic.bundle.json",
  "python/python-data-functions/modules/module6/topics/print-vs-return/topic.bundle.json",
  "python/python-data-functions/modules/module6/topics/scope-and-local-variables/topic.bundle.json",
  "python/python-data-functions/modules/module7/topics/validating-and-cleaning-input/topic.bundle.json",
  "python/python-data-functions/modules/module7/topics/working-with-paths/topic.bundle.json",
  "python/python-data-functions/modules/module7/topics/reading-text-files/topic.bundle.json",
  "python/python-v2/modules/module0/topics/values-types-and-literals/topic.bundle.json",
  "python/applied-python-projects/modules/module8/topics/class-files-and-instances/topic.bundle.json",
] as const;

function loadTopicBundle(
  relativePath: string,
): JsonRecord {
  return JSON.parse(
    readFileSync(
      new URL(
        `../subjects/${relativePath}`,
        import.meta.url,
      ),
      "utf8",
    ),
  ) as JsonRecord;
}

function joinedExercises() {
  const joined =
    new Map<
      string,
      {
        ownerCardId: string;
        exercise: unknown;
      }
    >();

  for (const relativePath of topicBundleFiles) {
    const bundle =
      loadTopicBundle(relativePath);
    const exercises =
      Array.isArray(bundle.exercises)
        ? bundle.exercises
        : [];
    const byId =
      new Map<string, unknown>();

    for (const value of exercises) {
      const exercise = record(value);
      const id =
        stringValue(exercise?.id);

      if (id) {
        byId.set(id, value);
      }
    }

    const cards =
      Array.isArray(bundle.cards)
        ? bundle.cards
        : [];

    for (const value of cards) {
      const card = record(value);
      const tryIt =
        record(card?.tryIt);
      const exerciseKey =
        stringValue(
          tryIt?.exerciseKey,
        );

      if (!exerciseKey) continue;

      joined.set(exerciseKey, {
        ownerCardId:
          stringValue(card?.id),
        exercise:
          byId.get(exerciseKey),
      });
    }
  }

  return joined;
}

const fixedTestEligibleIds = [
  "try-creating-and-indexing-lists-sketch0",
  "try-creating-and-indexing-lists-sketch1",
  "try-dictionary-basics-sketch0",
  "try-looping-through-lists-sketch0",
  "try-workshop-schedule-sketch0",
  "try-nested-data-structures-sketch0",
  "try-nested-data-structures-sketch1",
  "try-tuple-records-sketch0",
  "try-tuple-unpacking-sketch1",
  "try-updating-and-looping-dictionaries-sketch1",
] as const;

const semanticEligibleIds = [
  "try-creating-and-indexing-lists-sketch2",
  "try-dictionary-basics-sketch1",
  "try-dictionary-basics-sketch2",
  "try-list-methods-and-mutation-sketch0",
  "try-list-methods-and-mutation-sketch1",
  "try-list-methods-and-mutation-sketch2",
  "try-looping-through-lists-sketch1",
  "try-looping-through-lists-sketch2",
  "try-nested-data-structures-sketch2",
  "try-updating-and-looping-dictionaries-sketch0",
  "try-updating-and-looping-dictionaries-sketch2",
  "try-decomposition-and-refactoring-sketch0",
  "try-decomposition-and-refactoring-sketch1",
  "try-decomposition-and-refactoring-sketch2",
  "try-defining-and-calling-functions-sketch0",
  "try-defining-and-calling-functions-sketch1",
  "try-defining-and-calling-functions-sketch2",
  "try-docstrings-and-function-contracts-sketch0",
  "try-docstrings-and-function-contracts-sketch1",
  "try-docstrings-and-function-contracts-sketch2",
  "try-parameters-and-return-values-sketch0",
  "try-parameters-and-return-values-sketch1",
  "try-print-vs-return-sketch0",
  "try-print-vs-return-sketch1",
  "try-print-vs-return-sketch2",
  "try-scope-and-local-variables-sketch0",
  "try-scope-and-local-variables-sketch1",
  "try-scope-and-local-variables-sketch2",
  "try-validating-and-cleaning-input-sketch0",
  "try-working-with-paths-sketch0",
  "try-working-with-paths-sketch1",
] as const;

const complexFallbackIds = [
  "try-reading-text-files-sketch0",
  "try-working-with-paths-sketch2",
  "ci-read-and-print",
  "try-class-files-and-instances-sketch0",
] as const;

function semanticChecks(
  exerciseValue: unknown,
): unknown[] {
  const exercise =
    record(exerciseValue);
  const recipe =
    record(exercise?.recipe);

  if (
    Array.isArray(
      recipe?.semanticChecks,
    )
  ) {
    return recipe.semanticChecks;
  }

  return Array.isArray(
    exercise?.semanticChecks,
  )
    ? exercise.semanticChecks
    : [];
}

describe(
  "published embedded Python Try It eligibility",
  () => {
    const joined = joinedExercises();

    it.each(
      fixedTestEligibleIds,
    )(
      "keeps %s eligible for the direct Vite editor",
      (exerciseKey) => {
        const pair =
          joined.get(exerciseKey);

        expect(pair).toBeDefined();
        expect(
          pair?.ownerCardId,
        ).toMatch(/^sketch\d+$/);
        expect(
          isEligibleStudentEmbeddedPythonTryIt(
            pair?.exercise,
          ),
        ).toBe(true);
      },
    );

    it("locks the audited semantic candidate inventory", () => {
      expect(
        semanticEligibleIds,
      ).toHaveLength(31);
    });

    it.each(
      semanticEligibleIds,
    )(
      "keeps semantic exercise %s eligible for the direct Vite editor",
      (exerciseKey) => {
        const pair =
          joined.get(exerciseKey);

        expect(pair).toBeDefined();
        expect(
          pair?.ownerCardId,
        ).toMatch(/^sketch\d+$/);
        expect(
          semanticChecks(
            pair?.exercise,
          ).length,
        ).toBeGreaterThan(0);
        expect(
          isEligibleStudentEmbeddedPythonTryIt(
            pair?.exercise,
          ),
        ).toBe(true);
      },
    );

    it.each(
      complexFallbackIds,
    )(
      "keeps complex exercise %s on the full workspace fallback",
      (exerciseKey) => {
        const pair =
          joined.get(exerciseKey);

        expect(pair).toBeDefined();
        expect(
          isEligibleStudentEmbeddedPythonTryIt(
            pair?.exercise,
          ),
        ).toBe(false);
      },
    );
  },
);
