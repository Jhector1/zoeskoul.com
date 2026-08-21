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
  it("keeps completed exercises in canonical selected order", () => {
    const active = item("f-strings-and-formatting", "format-average");

    const rows = resolveCanonicalPracticeQueueRows({
      selectedTargets: [
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
      ],
      completedPrefix: [
        {
          topicSlug: "f-strings-and-formatting",
          sectionSlug: "strings",
          exerciseKey: "format-price",
          exerciseTitle: "Format a price",
          exerciseKind: "code_input",
          correct: true,
        },
      ],
      queueStack: [active],
    });

    expect(rows.map((row) => row.target.exerciseKey)).toEqual([
      "format-average",
      "format-price",
    ]);
    expect(rows[0]).toMatchObject({
      item: active,
      sessionIndex: 0,
      completed: null,
    });
    expect(rows[1]).toMatchObject({
      item: null,
      sessionIndex: -1,
      completed: {
        exerciseKey: "format-price",
        correct: true,
      },
    });
  });
});
