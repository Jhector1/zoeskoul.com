import { describe, expect, it } from "vitest";

import { historyRowToQItem } from "@/lib/practice/runtime";
import { mergeSelfPacedCompletedHistoryStack } from "./selfPacedCompletionReconciliation";
import { resolveCanonicalPracticeQueueRows } from "./canonicalPracticeQueueProjection";

function remainingItem() {
  return {
    key: "signed-remaining",
    exercise: {
      id: "truthiness",
      exerciseKey: "truthiness",
      topic: "if-elif-else",
      topicSlug: "if-elif-else",
      kind: "code_input",
      title: "truthiness",
      prompt: "Use truthiness",
    },
    code: "",
    submitted: false,
    result: null,
  } as any;
}

describe("completed Practice inspection navigation", () => {
  it("materializes a finalized completed item with a real canonical sidebar index", () => {
    const completed = historyRowToQItem({
      instanceId: "completed-instance-1",
      answeredAt: "2026-08-22T07:01:00.000Z",
      topic: "if-elif-else",
      kind: "code_input",
      title: "choose-even-or-odd",
      prompt: "Choose even or odd",
      publicPayload: {
        exerciseKey: "choose-even-or-odd",
        topic: "if-elif-else",
        topicSlug: "if-elif-else",
        kind: "code_input",
        title: "choose-even-or-odd",
        prompt: "Choose even or odd",
      },
      lastOk: true,
      lastAnswerPayload: {
        kind: "code_input",
        code: "number = int(input())\nprint(number % 2)\n",
      },
    } as any);
    const remaining = remainingItem();

    const stack = mergeSelfPacedCompletedHistoryStack({
      stack: [remaining],
      completedItems: [completed],
    });

    const targets = [
      {
        exerciseKey: "choose-even-or-odd",
        exerciseTitle: "Choose even or odd",
        exerciseKind: "code_input",
        topicSlug: "if-elif-else",
        sectionSlug: "conditions",
      },
      {
        exerciseKey: "truthiness",
        exerciseTitle: "Truthiness",
        exerciseKind: "code_input",
        topicSlug: "if-elif-else",
        sectionSlug: "conditions",
      },
    ];

    const rows = resolveCanonicalPracticeQueueRows({
      selectedTargets: targets,
      completedPrefix: [{ ...targets[0], correct: true }],
      queueStack: stack,
    });

    expect(stack[0]?.key).toBe("history:completed-instance-1");
    expect(stack[0]?.submitted).toBe(true);
    expect((stack[0]?.result as any)?.finalized).toBe(true);
    expect((stack[0] as any)?.code).toContain("number = int(input())");
    expect(rows[0]).toMatchObject({
      completed: { exerciseKey: "choose-even-or-odd", correct: true },
      item: stack[0],
      sessionIndex: 0,
      locked: false,
    });
    expect(rows[1]).toMatchObject({
      item: remaining,
      sessionIndex: 1,
    });
  });

  it("preserves newer browser state for an already-materialized completed identity", () => {
    const existing = {
      key: "signed-existing",
      exercise: {
        id: "choose-even-or-odd",
        exerciseKey: "choose-even-or-odd",
        topic: "if-elif-else",
        topicSlug: "if-elif-else",
        kind: "code_input",
        title: "choose-even-or-odd",
        prompt: "Choose even or odd",
      },
      code: "newer browser work",
      submitted: true,
      result: { ok: true, finalized: true },
    } as any;
    const historical = {
      ...existing,
      key: "history:older",
      code: "older stored answer",
    } as any;

    const merged = mergeSelfPacedCompletedHistoryStack({
      stack: [existing],
      completedItems: [historical],
    });

    expect(merged[0]).toBe(existing);
    expect((merged[0] as any).code).toBe("newer browser work");
  });
});
