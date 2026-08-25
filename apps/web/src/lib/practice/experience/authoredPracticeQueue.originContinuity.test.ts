import { describe, expect, it } from "vitest";

import {
  resolveAuthoredPracticeHistoryTarget,
  resolveNextAuthoredPracticeTarget,
  type AuthoredPracticeTarget,
} from "./authoredPracticeQueue";

function target(
  exerciseKey: string,
  topicSlug: string,
): AuthoredPracticeTarget {
  return {
    subjectSlug: "python-v2",
    moduleSlug: "python-v2-1",
    sectionSlug: "section-a",
    topicSlug,
    exerciseKey,
    exerciseTitle: exerciseKey,
    exerciseKind: "code_input",
    exercisePurpose: "practice",
  };
}

describe("canonical authored Practice history identity", () => {
  it("resolves missing DB topic relation from authored payload identity", () => {
    const candidates = [
      target("observe-reassignment", "common-variable-mistakes"),
      target("double-decimal", "input-and-type-conversion"),
    ];

    expect(
      resolveAuthoredPracticeHistoryTarget({
        item: {
          exerciseKey:
            "python-v2:python-v2-1:section-a:common-variable-mistakes:standalone-standard:observe-reassignment",
          publicPayload: {
            id: "observe-reassignment",
            topicSlug: "common-variable-mistakes",
          },
          topic: null,
        },
        candidates,
      }),
    ).toEqual(candidates[0]);
  });

  it("resolves a unique runtime-scoped key even when topic metadata is absent", () => {
    const candidates = [
      target("turn-number-looking-text", "common-variable-mistakes"),
      target("double-decimal", "input-and-type-conversion"),
    ];

    expect(
      resolveAuthoredPracticeHistoryTarget({
        item: {
          exerciseKey:
            "python-v2:python-v2-1:unknown:common-variable-mistakes:standalone-standard:turn-number-looking-text",
          publicPayload: null,
          topic: null,
        },
        candidates,
      }),
    ).toEqual(candidates[0]);
  });

  it("uses a legacy raw topic id to disambiguate canonical candidates", () => {
    const candidates = [
      target("shared-key", "python_module_1.topic-a"),
      target("shared-key", "python_module_1.topic-b"),
    ];

    expect(
      resolveAuthoredPracticeHistoryTarget({
        item: {
          exerciseKey: "runtime:standalone-standard:shared-key",
          publicPayload: {
            id: "shared-key",
            topicSlug: "topic-b",
          },
          topic: null,
        },
        candidates,
      }),
    ).toEqual(candidates[1]);
  });

  it("does not fall back to a unique key when persisted topic metadata mismatches", () => {
    const candidates = [
      target("same-key", "topic-current"),
      target("another-key", "topic-other"),
    ];

    expect(
      resolveAuthoredPracticeHistoryTarget({
        item: {
          exerciseKey: "runtime:standalone-standard:same-key",
          publicPayload: {
            id: "same-key",
            topicSlug: "topic-legacy-other",
          },
          topic: {
            slug: "topic-legacy-other",
          },
        },
        candidates,
      }),
    ).toBeNull();
  });

  it("still allows the legacy unique-key fallback when topic metadata is truly absent", () => {
    const candidates = [
      target("legacy-only-key", "topic-current"),
      target("another-key", "topic-other"),
    ];

    expect(
      resolveAuthoredPracticeHistoryTarget({
        item: {
          exerciseKey: "runtime:standalone-standard:legacy-only-key",
          publicPayload: {
            id: "legacy-only-key",
          },
          topic: null,
        },
        candidates,
      }),
    ).toEqual(candidates[0]);
  });

  it("does not guess a key-only identity when the authored key is ambiguous", () => {
    const candidates = [
      target("shared-key", "topic-a"),
      target("shared-key", "topic-b"),
    ];

    expect(
      resolveAuthoredPracticeHistoryTarget({
        item: {
          exerciseKey: "runtime:standalone-standard:shared-key",
          publicPayload: null,
          topic: null,
        },
        candidates,
      }),
    ).toBeNull();
  });

  it("uses the same canonical resolver to prevent replaying a used target", () => {
    const queue = [
      target("turn-number-looking-text", "common-variable-mistakes"),
      target("double-decimal", "input-and-type-conversion"),
    ];

    expect(
      resolveNextAuthoredPracticeTarget({
        queue,
        usedTargets: [
          {
            exerciseKey:
              "python-v2:python-v2-1:unknown:common-variable-mistakes:standalone-standard:turn-number-looking-text",
            publicPayload: {
              id: "turn-number-looking-text",
            },
            topic: null,
          },
        ],
      }),
    ).toEqual(queue[1]);
  });
});
