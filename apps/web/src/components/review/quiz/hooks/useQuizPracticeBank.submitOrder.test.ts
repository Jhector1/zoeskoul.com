import { describe, expect, it } from "vitest";

import { orderPracticeWorkspaceSubmitCandidateKeys } from "./useQuizPracticeBank";

describe("orderPracticeWorkspaceSubmitCandidateKeys", () => {
  it("prefers the visible question workspace over stale bound and active identities", () => {
    expect(
      orderPracticeWorkspaceSubmitCandidateKeys({
        stableKey: "visible-question",
        wantedIds: new Set(["visible-id", "shared-id"]),
        boundExerciseKey: "stale-bound",
        activeExerciseKey: "stale-active",
      }),
    ).toEqual([
      "visible-question",
      "visible-id",
      "shared-id",
      "stale-bound",
      "stale-active",
    ]);
  });

  it("deduplicates repeated identities without changing priority", () => {
    expect(
      orderPracticeWorkspaceSubmitCandidateKeys({
        stableKey: "visible-question",
        wantedIds: new Set(["visible-question", "shared-id"]),
        boundExerciseKey: "shared-id",
        activeExerciseKey: "visible-question",
      }),
    ).toEqual(["visible-question", "shared-id"]);
  });
});
