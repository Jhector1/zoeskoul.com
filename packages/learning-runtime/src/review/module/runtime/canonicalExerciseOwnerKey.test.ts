import { describe, expect, it } from "vitest";
import { resolveCanonicalExerciseOwnerKey } from "./canonicalExerciseOwnerKey";

function exerciseEntry(key: string, exerciseId: string, cardId: string) {
  return {
    ownerKind: "exercise",
    exerciseStateKey: key,
    exerciseId,
    cardId,
    toolManifest: { id: exerciseId, exerciseKey: exerciseId },
  };
}

describe("resolveCanonicalExerciseOwnerKey", () => {
  it("prefers the route-bound canonical owner over stale q.fetch reconstruction", () => {
    const current = "s::m::sec::topic::card::try-current";
    const stale = "s::m::old-sec::topic::card::try-current";

    expect(resolveCanonicalExerciseOwnerKey({
      registry: {
        byKey: {
          [`exercise:${current}`]: exerciseEntry(current, "try-current", "card"),
        },
      },
      exercises: {
        [current]: {
          exerciseId: "try-current",
          cardId: "card",
          manifest: { id: "try-current" },
        },
      },
      boundExerciseKey: current,
      activeExerciseKey: current,
      authoredExerciseId: "try-current",
      ownerCardId: "card",
      fallbackExerciseKey: stale,
    })).toBe(current);
  });

  it("rejects the previous project step even when it is still bound", () => {
    const previous = "s::m::sec::topic::project::step-1";
    const current = "s::m::sec::topic::project::step-2";

    expect(resolveCanonicalExerciseOwnerKey({
      registry: {
        byKey: {
          [`exercise:${previous}`]: exerciseEntry(previous, "step-1", "project"),
          [`exercise:${current}`]: exerciseEntry(current, "step-2", "project"),
        },
      },
      exercises: {
        [previous]: { exerciseId: "step-1", cardId: "project" },
        [current]: { exerciseId: "step-2", cardId: "project" },
      },
      boundExerciseKey: previous,
      activeExerciseKey: previous,
      authoredExerciseId: "step-2",
      ownerCardId: "project",
      fallbackExerciseKey: "stale-soft-nav-key",
    })).toBe(current);
  });

  it("finds an embedded Try It hidden child from registry byKey", () => {
    const current = "s::m::sec::topic::lesson-card::try-it";

    expect(resolveCanonicalExerciseOwnerKey({
      registry: {
        byKey: {
          "card:lesson-card": {
            ownerKind: "card",
            cardId: "lesson-card",
          },
          [`exercise:${current}`]: exerciseEntry(current, "try-it", "lesson-card"),
        },
      },
      exercises: {
        [current]: {
          exerciseId: "try-it",
          cardId: "lesson-card",
          manifest: { exerciseKey: "try-it" },
        },
      },
      authoredExerciseId: "try-it",
      ownerCardId: "lesson-card",
      fallbackExerciseKey: "stale-fetch-key",
    })).toBe(current);
  });

  it("does not take a matching exercise id from another card", () => {
    const other = "s::m::sec::topic::other-card::same-id";

    expect(resolveCanonicalExerciseOwnerKey({
      registry: {
        byKey: {
          [`exercise:${other}`]: exerciseEntry(other, "same-id", "other-card"),
        },
      },
      exercises: {
        [other]: { exerciseId: "same-id", cardId: "other-card" },
      },
      boundExerciseKey: other,
      activeExerciseKey: other,
      authoredExerciseId: "same-id",
      ownerCardId: "current-card",
      fallbackExerciseKey: "legacy-current-card-key",
    })).toBe("legacy-current-card-key");
  });

  it("preserves a legacy key when it is already the canonical owner", () => {
    const direct = "s::m::sec::topic::card::exercise";

    expect(resolveCanonicalExerciseOwnerKey({
      registry: {
        byKey: {
          [`exercise:${direct}`]: exerciseEntry(direct, "exercise", "card"),
        },
      },
      exercises: {
        [direct]: { exerciseId: "exercise", cardId: "card" },
      },
      authoredExerciseId: "exercise",
      ownerCardId: "card",
      fallbackExerciseKey: direct,
    })).toBe(direct);
  });
});
