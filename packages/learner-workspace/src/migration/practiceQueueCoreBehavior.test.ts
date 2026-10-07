import { describe, expect, it } from "vitest";

import {
  resolveCanonicalPracticeQueueRows,
} from "../practice/experience/canonicalPracticeQueueProjection";

import {
  mergeSelfPacedCompletedHistoryStack,
  reconcileSelfPacedCompletionStack,
} from "../practice/experience/selfPacedCompletionReconciliation";

function item(
  topicSlug: string,
  exerciseKey: string,
) {
  return {
    key: exerciseKey,
    exercise: {
      id: exerciseKey,
      topic: topicSlug,
      topicSlug,
      exerciseKey,
      difficulty: "easy" as const,
      title: exerciseKey,
      prompt: exerciseKey,
      kind: "text_input" as const,
    },
    single: "",
    multi: [],
    num: "",
    dragA: { x: 0, y: 0 },
    dragB: { x: 0, y: 0 },
    matRows: 0,
    matCols: 0,
    mat: [],
    result: null,
    submitted: false,
    code: "",
    codeLang: "python",
    codeStdin: "",
    text: "",
    voiceTranscript: "",
    help: null,
  };
}

describe(
  "Practice queue core behavior",
  () => {
    it(
      "preserves canonical queue projection, locking, and completed-first display",
      () => {
        const first = item(
          "python",
          "first",
        );

        const second = item(
          "python",
          "second",
        );

        const targets = [
          {
            topicSlug: "python",
            exerciseKey: "first",
          },
          {
            topicSlug: "python",
            exerciseKey: "second",
          },
        ];

        const rows =
          resolveCanonicalPracticeQueueRows({
            selectedTargets: targets,
            completedPrefix: [
              {
                topicSlug: "python",
                exerciseKey: "second",
                correct: true,
              },
            ],
            allowedTargets: [
              targets[0]!,
            ],
            queueStack: [
              first,
              second,
            ],
          });

        expect(
          rows.map(
            (row) =>
              row.target.exerciseKey,
          ),
        ).toEqual([
          "second",
          "first",
        ]);

        expect(
          rows[0]?.completed?.correct,
        ).toBe(true);

        expect(
          rows[0]?.sessionIndex,
        ).toBe(1);

        expect(rows[1]?.locked).toBe(
          false,
        );
      },
    );

    it(
      "reconciles canonical completion without replacing unchanged stack unnecessarily",
      () => {
        const first = item(
          "python",
          "first",
        );

        const stack = [first];

        const untouched =
          reconcileSelfPacedCompletionStack({
            stack,
            completedPrefix: [],
          });

        expect(untouched).toBe(stack);

        const reconciled =
          reconcileSelfPacedCompletionStack({
            stack,
            completedPrefix: [
              {
                topicSlug: "python",
                exerciseKey: "first",
                correct: true,
              },
            ],
          });

        expect(reconciled).not.toBe(
          stack,
        );

        expect(
          reconciled[0]?.submitted,
        ).toBe(true);

        expect(
          reconciled[0]?.result?.ok,
        ).toBe(true);

        expect(
          reconciled[0]?.result
            ?.finalized,
        ).toBe(true);
      },
    );

    it(
      "merges completed history ahead of remaining rows while preserving live instances",
      () => {
        const liveFirst = item(
          "python",
          "first",
        );

        const second = item(
          "python",
          "second",
        );

        const historicalFirst = item(
          "python",
          "first",
        );

        const merged =
          mergeSelfPacedCompletedHistoryStack({
            stack: [
              second,
              liveFirst,
            ],
            completedItems: [
              historicalFirst,
            ],
          });

        expect(merged[0]).toBe(
          liveFirst,
        );

        expect(merged[1]).toBe(
          second,
        );
      },
    );
  },
);
