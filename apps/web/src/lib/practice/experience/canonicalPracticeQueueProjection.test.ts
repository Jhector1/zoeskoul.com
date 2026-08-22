import { describe, expect, it } from "vitest";

import { resolveCanonicalPracticeQueueRows } from "./canonicalPracticeQueueProjection";

function item(topicSlug: string, exerciseKey: string) {
  return {
    key: `signed-${exerciseKey}`,
    exercise: {
      id: exerciseKey,
      exerciseKey,
      topic: topicSlug,
      topicSlug,
      kind: "code_input",
      title: exerciseKey,
      prompt: exerciseKey,
    },
  } as any;
}

describe("resolveCanonicalPracticeQueueRows", () => {
  it("puts completed exercises first while preserving canonical order inside both groups", () => {
    const firstRemaining = item("f-strings-and-formatting", "format-average");

    const targets = [
      {
        topicSlug: "f-strings-and-formatting",
        sectionSlug: "strings",
        exerciseKey: "format-average",
        exerciseTitle: "Format a calculated average",
        exerciseKind: "code_input",
      },
      {
        topicSlug: "f-strings-and-formatting",
        sectionSlug: "strings",
        exerciseKey: "format-price",
        exerciseTitle: "Format a price",
        exerciseKind: "code_input",
      },
      {
        topicSlug: "f-strings-and-formatting",
        sectionSlug: "strings",
        exerciseKey: "format-name",
        exerciseTitle: "Format a name",
        exerciseKind: "code_input",
      },
      {
        topicSlug: "f-strings-and-formatting",
        sectionSlug: "strings",
        exerciseKey: "format-total",
        exerciseTitle: "Format a total",
        exerciseKind: "code_input",
      },
    ];

    const rows = resolveCanonicalPracticeQueueRows({
      selectedTargets: targets,
      completedPrefix: [
        { ...targets[1], correct: true },
        { ...targets[3], correct: true },
      ],
      queueStack: [firstRemaining],
    });

    expect(rows.map((row) => row.target.exerciseKey)).toEqual([
      "format-price",
      "format-total",
      "format-average",
      "format-name",
    ]);
    expect(rows.slice(0, 2).map((row) => row.completed?.exerciseKey)).toEqual([
      "format-price",
      "format-total",
    ]);
    expect(rows[2]).toMatchObject({
      item: firstRemaining,
      sessionIndex: 0,
      completed: null,
    });
  });
  it("keeps the full module visible while locking rows outside the Daily allowance", () => {
    const targets = ["one", "two", "three", "four", "five"].map(
      (exerciseKey) => ({
        topicSlug: `topic-${exerciseKey}`,
        sectionSlug: "section",
        exerciseKey,
        exerciseTitle: exerciseKey,
        exerciseKind: "code_input",
      }),
    );

    const rows = resolveCanonicalPracticeQueueRows({
      selectedTargets: targets,
      allowedTargets: targets.slice(0, 3),
      completedPrefix: [{ ...targets[4], correct: true }],
      queueStack: [item("topic-one", "one")],
    });

    expect(
      rows.map((row) => ({
        exerciseKey: row.target.exerciseKey,
        locked: row.locked,
        completed: Boolean(row.completed),
      })),
    ).toEqual([
      { exerciseKey: "five", locked: false, completed: true },
      { exerciseKey: "one", locked: false, completed: false },
      { exerciseKey: "two", locked: false, completed: false },
      { exerciseKey: "three", locked: false, completed: false },
      { exerciseKey: "four", locked: true, completed: false },
    ]);

    // Display partitioning never changes the executable Daily queue index.
    expect(rows[1]?.target.exerciseKey).toBe("one");
    expect(rows[1]?.sessionIndex).toBe(0);
  });

});
