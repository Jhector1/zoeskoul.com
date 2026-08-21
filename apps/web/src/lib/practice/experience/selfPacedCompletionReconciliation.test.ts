import { describe, expect, it } from "vitest";

import { reconcileSelfPacedCompletionStack } from "./selfPacedCompletionReconciliation";

function item(args: {
  topic: string;
  exerciseKey: string;
  code?: string;
}) {
  return {
    key: `signed-${args.exerciseKey}`,
    exercise: {
      id: args.exerciseKey,
      exerciseKey: args.exerciseKey,
      topic: args.topic,
      kind: "code_input",
      title: args.exerciseKey,
      prompt: args.exerciseKey,
    },
    code: args.code ?? "",
    submitted: false,
    result: null,
  } as any;
}

describe("reconcileSelfPacedCompletionStack", () => {
  it("marks matching restored rows from canonical completion without reordering or replacing workspace state", () => {
    const first = item({
      topic: "common-variable-mistakes",
      exerciseKey: "turn-text-number",
      code: "age = 12",
    });
    const second = item({
      topic: "input-and-type-conversion",
      exerciseKey: "double-decimal",
      code: "draft learner code",
    });
    const stack = [first, second];

    const reconciled = reconcileSelfPacedCompletionStack({
      stack,
      completedPrefix: [
        {
          topicSlug: "input-and-type-conversion",
          sectionSlug: "variables-and-assignment",
          exerciseKey: "double-decimal",
          exerciseTitle: "Double a decimal input",
          exerciseKind: "code_input",
          correct: true,
        },
      ],
    });

    expect(reconciled).toHaveLength(2);
    expect(reconciled[0]).toBe(first);
    expect(reconciled[1].exercise).toBe(second.exercise);
    expect((reconciled[1] as any).code).toBe("draft learner code");
    expect((reconciled[1] as any).submitted).toBe(true);
    expect((reconciled[1] as any).result).toMatchObject({
      ok: true,
      finalized: true,
    });
  });

  it("marks a canonically completed non-correct row done without calling it correct", () => {
    const stack = [
      item({
        topic: "truthiness-and-empty-values",
        exerciseKey: "truthiness-branch",
      }),
    ];

    const reconciled = reconcileSelfPacedCompletionStack({
      stack,
      completedPrefix: [
        {
          topicSlug: "truthiness-and-empty-values",
          sectionSlug: "conditions-and-logic",
          exerciseKey: "truthiness-branch",
          exerciseTitle: "Use truthiness in a branch",
          exerciseKind: "code_input",
          correct: false,
        },
      ],
    });

    expect((reconciled[0] as any).submitted).toBe(true);
    expect((reconciled[0] as any).result).toMatchObject({
      ok: false,
      finalized: true,
    });
  });
});
