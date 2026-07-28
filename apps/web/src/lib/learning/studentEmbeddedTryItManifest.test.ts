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

const topicFiles = [
  "creating-and-indexing-lists",
  "list-methods-and-mutation",
  "looping-through-lists",
  "dictionary-basics",
  "updating-and-looping-dictionaries",
  "tuple-records-and-unpacking",
  "nested-data-structures",
  "module-5-workshop-schedule-project",
] as const;

function loadTopicBundle(
  topic: string,
): JsonRecord {
  return JSON.parse(
    readFileSync(
      new URL(
        `../subjects/python/python-data-functions/` +
          `modules/module5/topics/${topic}/` +
          "topic.bundle.json",
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

  for (const topic of topicFiles) {
    const bundle =
      loadTopicBundle(topic);
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

const eligibleIds = [
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

const semanticFallbackIds = [
  "try-creating-and-indexing-lists-sketch2",
  "try-dictionary-basics-sketch1",
  "try-list-methods-and-mutation-sketch0",
  "try-looping-through-lists-sketch1",
  "try-nested-data-structures-sketch2",
  "try-updating-and-looping-dictionaries-sketch0",
] as const;

describe(
  "published embedded Python Try It eligibility",
  () => {
    const joined = joinedExercises();

    it.each(
      eligibleIds,
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

    it.each(
      semanticFallbackIds,
    )(
      "keeps %s on the full workspace fallback",
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
