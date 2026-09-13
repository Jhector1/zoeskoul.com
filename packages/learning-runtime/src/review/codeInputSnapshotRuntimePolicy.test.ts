import { describe, expect, it } from "vitest";

import {
  shouldPropagateReviewCodeInputSnapshotToRuntime,
} from "./codeInputSnapshotRuntimePolicy";

describe("shouldPropagateReviewCodeInputSnapshotToRuntime", () => {
  it("propagates a changed registration", () => {
    expect(
      shouldPropagateReviewCodeInputSnapshotToRuntime({
        registrationChanged: true,
        applyToMountedEditor: false,
        userEdited: false,
      }),
    ).toBe(true);
  });

  it("propagates a mounted-editor replacement command", () => {
    expect(
      shouldPropagateReviewCodeInputSnapshotToRuntime({
        registrationChanged: false,
        applyToMountedEditor: true,
        userEdited: false,
      }),
    ).toBe(true);
  });

  it("propagates a real user edit even when the registry already matches it", () => {
    expect(
      shouldPropagateReviewCodeInputSnapshotToRuntime({
        registrationChanged: false,
        applyToMountedEditor: false,
        userEdited: true,
      }),
    ).toBe(true);
  });

  it("dedupes a passive unchanged sync", () => {
    expect(
      shouldPropagateReviewCodeInputSnapshotToRuntime({
        registrationChanged: false,
        applyToMountedEditor: false,
        userEdited: false,
      }),
    ).toBe(false);
  });
});
