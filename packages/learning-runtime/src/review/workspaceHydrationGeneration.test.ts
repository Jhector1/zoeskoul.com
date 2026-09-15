import { describe, expect, it } from "vitest";

import {
  nextReviewResetRevision,
  resolveReviewProgressHydrationGeneration,
} from "./workspaceHydrationGeneration";

describe("resolveReviewProgressHydrationGeneration", () => {
  it("accepts the latest server workspace as the baseline on a fresh session", () => {
    expect(
      resolveReviewProgressHydrationGeneration({
        persistedGeneration: undefined,
        runtimeResetRevision: 0,
      }),
    ).toBe(0);

    expect(
      resolveReviewProgressHydrationGeneration({
        persistedGeneration: 17,
        runtimeResetRevision: 0,
      }),
    ).toBe(0);
  });

  it("rejects unversioned persisted workspace after an explicit reset", () => {
    expect(
      resolveReviewProgressHydrationGeneration({
        persistedGeneration: undefined,
        runtimeResetRevision: 1,
      }),
    ).toBeUndefined();
  });

  it("rejects a workspace from an older reset generation", () => {
    expect(
      resolveReviewProgressHydrationGeneration({
        persistedGeneration: 0,
        runtimeResetRevision: 1,
      }),
    ).toBeUndefined();

    expect(
      resolveReviewProgressHydrationGeneration({
        persistedGeneration: 2,
        runtimeResetRevision: 3,
      }),
    ).toBeUndefined();
  });

  it("accepts a workspace produced in the active reset generation", () => {
    expect(
      resolveReviewProgressHydrationGeneration({
        persistedGeneration: 3,
        runtimeResetRevision: 3,
      }),
    ).toBe(3);
  });

  it("does not accept a future session-local generation as current", () => {
    expect(
      resolveReviewProgressHydrationGeneration({
        persistedGeneration: 9,
        runtimeResetRevision: 3,
      }),
    ).toBeUndefined();
  });

  it("does not let an old generation 1 impersonate the first reset of a new session", () => {
    const freshResetGeneration = nextReviewResetRevision(
      0,
      1_800_000_000_000,
    );

    expect(freshResetGeneration).toBe(1_800_000_000_000);

    expect(
      resolveReviewProgressHydrationGeneration({
        persistedGeneration: 1,
        runtimeResetRevision: freshResetGeneration,
      }),
    ).toBeUndefined();

    expect(
      resolveReviewProgressHydrationGeneration({
        persistedGeneration: freshResetGeneration,
        runtimeResetRevision: freshResetGeneration,
      }),
    ).toBe(freshResetGeneration);
  });

  it("remains strictly monotonic when the clock does not advance", () => {
    expect(
      nextReviewResetRevision(
        1_800_000_000_000,
        1_700_000_000_000,
      ),
    ).toBe(1_800_000_000_001);

    expect(
      nextReviewResetRevision(
        1_800_000_000_000,
        1_800_000_000_000,
      ),
    ).toBe(1_800_000_000_001);
  });

});
